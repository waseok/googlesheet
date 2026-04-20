/**
 * ============================================================================
 * 와석초 구글 시트 통합 관리 대시보드 (Wasok Sheet Hub) - Google Apps Script
 * ============================================================================
 * 목록 규칙:
 *   - 제목에 "[와석초]" 가 정확히 들어간 스프레드시트만
 *   - 생성일(createdTime)이 LIST_YEAR 연도인 것만
 *   - 제목에 "취합"이 있으면 collectItems 로
 *   - 그 외 중 제목에 "정보"가 있으면 items(정보 시트 구역)로. 둘 다 없으면 표시하지 않음
 *   - completedItems: 완료 폴더 직속·허브 규칙에 맞는 시트 목록 (하단 구역 표시용)
 *
 * [중요] Drive 고급 서비스 활성화 필요:
 *   GAS 편집기 좌측 → 서비스(+) → "Drive API" 추가
 *   → corpora: 'domain' 으로 도메인 전체 조직 공유 파일 검색
 *   → 스크립트 소유자가 직접 열지 않아도 조직 공유된 파일이 자동 반영됨
 *
 * 스크립트 속성:
 *   - COMPLETED_FOLDER_ID, MUTATION_TOKEN
 *   - LIST_YEAR (선택, 기본 2026)
 *   - SEARCH_CORPORA (선택, 기본 domain) — 목록 자동 검색 범위(domain | user)
 *   - RESTORE_FOLDER_ID (선택) — 되돌리기 시 이동할 폴더. 없으면 My Drive 루트
 * ============================================================================
 */

var DEFAULT_COMPLETED_FOLDER_ID = '';
var DEFAULT_LIST_YEAR = 2026;
var REQUIRED_TITLE_MARK = '[와석초]';
var COLLECT_MARK = '취합';
var INFO_MARK = '정보';
var SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
var REGISTERED_FILE_IDS_PROP = 'REGISTERED_FILE_IDS';
var VIRTUAL_COMPLETED_FILE_IDS_PROP = 'VIRTUAL_COMPLETED_FILE_IDS';

/**
 * 목록 자동 수집 검색 코퍼스:
 * - script property SEARCH_CORPORA 가 있으면 우선 (domain | user)
 * - 기본값은 domain (학교 조직 공유 파일 자동 수집 목적)
 */
function getSearchCorpora_() {
  var v = PropertiesService.getScriptProperties().getProperty('SEARCH_CORPORA');
  if (!v) return 'domain';
  v = String(v).toLowerCase().trim();
  return v === 'user' ? 'user' : 'domain';
}

function getCompletedFolderId_() {
  var id = PropertiesService.getScriptProperties().getProperty('COMPLETED_FOLDER_ID');
  return (id && id.length > 0) ? id : (DEFAULT_COMPLETED_FOLDER_ID || '');
}

function getRestoreTargetFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('RESTORE_FOLDER_ID');
  if (id && id.length > 0) return DriveApp.getFolderById(id);
  return DriveApp.getRootFolder();
}

function getMutationToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('MUTATION_TOKEN');
  return (t && t.length > 0) ? t : '';
}

function getListYear_() {
  var y = PropertiesService.getScriptProperties().getProperty('LIST_YEAR');
  if (y && /^\d{4}$/.test(y)) return parseInt(y, 10);
  return DEFAULT_LIST_YEAR;
}

function assertMutationAllowed_(tokenFromRequest) {
  var expected = getMutationToken_();
  if (!expected) {
    return {
      ok: false,
      error: '스크립트 속성 MUTATION_TOKEN 을 설정한 뒤, 동일한 값을 요청 token 으로 보내야 합니다.',
    };
  }
  if (!tokenFromRequest || tokenFromRequest !== expected) {
    return { ok: false, error: '유효하지 않은 token 입니다.' };
  }
  return { ok: true };
}

// ── DriveApp File 객체용 헬퍼 (완료·되돌리기·설명 저장 mutation 에서 사용) ──

function fileIsInFolder_(file, folderId) {
  if (!folderId) return false;
  try {
    var it = file.getParents();
    while (it.hasNext()) {
      if (it.next().getId() === folderId) return true;
    }
  } catch (e) {}
  return false;
}

function assertRestoreAllowed_(file) {
  var completedId = getCompletedFolderId_();
  if (!completedId) return { ok: false, error: 'COMPLETED_FOLDER_ID 가 설정되어 있어야 합니다.' };
  if (!fileIsInFolder_(file, completedId)) return { ok: false, error: '완료 폴더에 있는 시트만 되돌릴 수 있습니다.' };
  if (file.getMimeType() !== SPREADSHEET_MIME) return { ok: false, error: '스프레드시트만 되돌릴 수 있습니다.' };
  if (file.getName().indexOf(REQUIRED_TITLE_MARK) === -1) return { ok: false, error: '제목에 [와석초]가 포함된 시트만 되돌릴 수 있습니다.' };
  return { ok: true };
}

function assertFileAllowedForHub_(file) {
  if (file.getMimeType() !== SPREADSHEET_MIME) return { ok: false, error: '스프레드시트가 아닙니다.' };
  if (file.getName().indexOf(REQUIRED_TITLE_MARK) === -1) return { ok: false, error: '제목에 [와석초]가 포함된 시트만 완료 처리할 수 있습니다.' };
  var y = file.getDateCreated().getFullYear();
  if (y !== getListYear_()) {
    return { ok: false, error: getListYear_() + '년에 생성된 시트만 완료 처리할 수 있습니다.' };
  }
  return { ok: true };
}

function assertFileAllowedForDescription_(file) {
  var hub = assertFileAllowedForHub_(file);
  if (hub.ok) return hub;
  var folderId = getCompletedFolderId_();
  if (
    folderId &&
    fileIsInFolder_(file, folderId) &&
    file.getMimeType() === SPREADSHEET_MIME &&
    file.getName().indexOf(REQUIRED_TITLE_MARK) !== -1
  ) {
    return { ok: true };
  }
  return hub;
}

// ── Drive API v3 객체용 헬퍼 (목록 검색에서 사용) ───────────────────────────

/**
 * Drive API v3 file 객체가 허브 목록 규칙을 통과하는지 확인
 */
function driveObjPassesListRules_(f) {
  if (f.mimeType !== SPREADSHEET_MIME) return false;
  if ((f.name || '').indexOf(REQUIRED_TITLE_MARK) === -1) return false;
  if (!f.createdTime) return false;
  return new Date(f.createdTime).getFullYear() === getListYear_();
}

/**
 * Drive API v3 file 객체의 parents 배열에 folderId 가 있는지 확인
 */
function driveObjIsInFolder_(f, folderId) {
  if (!folderId) return false;
  var parents = f.parents || [];
  for (var i = 0; i < parents.length; i++) {
    if (parents[i] === folderId) return true;
  }
  return false;
}

/**
 * Drive API v3 file 객체 → SheetItem
 */
function driveObjToItem_(f) {
  var owner = (f.owners && f.owners[0]) || {};
  var authorEmail = owner.emailAddress || '';
  var authorName = owner.displayName || '';
  var author = '';
  if (authorName && authorName.trim().length > 0) {
    author = authorName.trim();
  } else if (authorEmail && authorEmail.indexOf('@') !== -1) {
    author = authorEmail.split('@')[0];
  } else {
    author = authorEmail;
  }
  return {
    id: f.id,
    name: f.name,
    url: f.webViewLink,
    author: author,
    authorEmail: authorEmail,
    description: f.description || '',
    lastUpdated: f.modifiedTime,
    createdTime: f.createdTime,
  };
}

/**
 * Drive API v3 단건 조회 (공유 드라이브 포함)
 * @param {string} fileId
 * @param {string=} fields
 * @returns {Object}
 */
function getDriveFileById_(fileId, fields) {
  return Drive.Files.get(fileId, {
    supportsAllDrives: true,
    fields: fields || 'id, name, webViewLink, owners, description, modifiedTime, createdTime, mimeType, parents',
  });
}

/**
 * 허브 규칙 검증(Drive API v3 file 객체 기준)
 * @param {Object} f
 * @returns {{ ok: boolean, error?: string }}
 */
function assertDriveObjAllowedForHub_(f) {
  if (!f || f.mimeType !== SPREADSHEET_MIME) {
    return { ok: false, error: '스프레드시트가 아닙니다.' };
  }
  if ((f.name || '').indexOf(REQUIRED_TITLE_MARK) === -1) {
    return { ok: false, error: '제목에 [와석초]가 포함된 시트만 완료 처리할 수 있습니다.' };
  }
  var ct = f.createdTime ? new Date(f.createdTime) : null;
  if (!ct || isNaN(ct.getTime()) || ct.getFullYear() !== getListYear_()) {
    return { ok: false, error: getListYear_() + '년에 생성된 시트만 완료 처리할 수 있습니다.' };
  }
  return { ok: true };
}

/**
 * 완료 폴더에 있는 [와석초] 스프레드시트만 복원 허용
 * @param {Object} f
 * @returns {{ ok: boolean, error?: string }}
 */
function assertDriveObjRestoreAllowed_(f) {
  var completedId = getCompletedFolderId_();
  if (!completedId) {
    return { ok: false, error: 'COMPLETED_FOLDER_ID 가 설정되어 있어야 합니다.' };
  }
  if (!driveObjIsInFolder_(f, completedId)) {
    return { ok: false, error: '완료 폴더에 있는 시트만 되돌릴 수 있습니다.' };
  }
  if (!f || f.mimeType !== SPREADSHEET_MIME) {
    return { ok: false, error: '스프레드시트만 되돌릴 수 있습니다.' };
  }
  if ((f.name || '').indexOf(REQUIRED_TITLE_MARK) === -1) {
    return { ok: false, error: '제목에 [와석초]가 포함된 시트만 되돌릴 수 있습니다.' };
  }
  return { ok: true };
}

/**
 * 파일 부모를 교체하여 대상 폴더로 이동(공유 드라이브 포함)
 * @param {Object} f Drive API v3 file 객체(부모 포함)
 * @param {string} targetFolderId
 */
function moveDriveFileToFolder_(f, targetFolderId) {
  var parents = f.parents || [];
  var removeParents = parents.join(',');
  var opts = {
    supportsAllDrives: true,
    addParents: targetFolderId,
    fields: 'id, parents',
  };
  if (removeParents) {
    opts.removeParents = removeParents;
  }
  return Drive.Files.update({}, f.id, null, opts);
}

/**
 * Drive API v3 로 도메인 전체 파일 검색 (페이지네이션 포함)
 * ※ GAS 편집기에서 서비스(+) → Drive API 를 추가해야 합니다.
 * @param {string} query Drive API v3 검색 쿼리
 * @returns {Array<Object>} Drive API v3 file 객체 배열
 */
function searchDomainFiles_(query) {
  var allFiles = [];
  var pageToken = null;
  var corpora = getSearchCorpora_();
  do {
    var params = {
      q: query,
      corpora: corpora,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'nextPageToken, files(id, name, webViewLink, owners, description, modifiedTime, createdTime, mimeType, parents)',
      pageSize: 1000,
    };
    if (pageToken) params.pageToken = pageToken;
    var resp = Drive.Files.list(params);
    var files = resp.files || [];
    allFiles = allFiles.concat(files);
    pageToken = resp.nextPageToken || null;
  } while (pageToken);
  return allFiles;
}

function sortItemsByLastUpdatedDesc_(items) {
  return items.slice().sort(function (a, b) {
    if (a.lastUpdated < b.lastUpdated) return 1;
    if (a.lastUpdated > b.lastUpdated) return -1;
    return 0;
  });
}

/**
 * ScriptProperties 에 저장된 등록 fileId 목록(JSON 배열)을 읽습니다.
 * @returns {Array<string>}
 */
function getRegisteredFileIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty(REGISTERED_FILE_IDS_PROP);
  if (!raw) {
    return [];
  }
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    var seen = {};
    var out = [];
    for (var i = 0; i < parsed.length; i++) {
      var v = parsed[i];
      if (typeof v !== 'string') {
        continue;
      }
      var id = v.trim();
      if (!id || seen[id]) {
        continue;
      }
      seen[id] = true;
      out.push(id);
    }
    return out;
  } catch (e) {
    return [];
  }
}

/**
 * 등록 fileId 목록을 ScriptProperties(JSON 배열)으로 저장합니다.
 * @param {Array<string>} ids
 */
function setRegisteredFileIds_(ids) {
  var seen = {};
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var v = ids[i];
    if (typeof v !== 'string') {
      continue;
    }
    var id = v.trim();
    if (!id || seen[id]) {
      continue;
    }
    seen[id] = true;
    out.push(id);
  }
  PropertiesService.getScriptProperties().setProperty(
    REGISTERED_FILE_IDS_PROP,
    JSON.stringify(out)
  );
}

/**
 * ScriptProperties 에 저장된 "가상 완료" fileId 목록(JSON 배열)을 읽습니다.
 * 이동 권한이 없어 실제 폴더 이동이 실패한 파일을 완료 상태로 관리할 때 사용합니다.
 * @returns {Array<string>}
 */
function getVirtualCompletedFileIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty(VIRTUAL_COMPLETED_FILE_IDS_PROP);
  if (!raw) {
    return [];
  }
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    var seen = {};
    var out = [];
    for (var i = 0; i < parsed.length; i++) {
      var v = parsed[i];
      if (typeof v !== 'string') continue;
      var id = v.trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  } catch (e) {
    return [];
  }
}

/**
 * "가상 완료" fileId 목록을 ScriptProperties(JSON 배열)으로 저장합니다.
 * @param {Array<string>} ids
 */
function setVirtualCompletedFileIds_(ids) {
  var seen = {};
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var v = ids[i];
    if (typeof v !== 'string') continue;
    var id = v.trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  PropertiesService.getScriptProperties().setProperty(
    VIRTUAL_COMPLETED_FILE_IDS_PROP,
    JSON.stringify(out)
  );
}

/**
 * 가상 완료 목록에 fileId를 추가합니다.
 * @param {string} fileId
 */
function addVirtualCompletedFileId_(fileId) {
  var ids = getVirtualCompletedFileIds_();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] === fileId) return;
  }
  ids.push(fileId);
  setVirtualCompletedFileIds_(ids);
}

/**
 * 가상 완료 목록에서 fileId를 제거합니다.
 * @param {string} fileId
 */
function removeVirtualCompletedFileId_(fileId) {
  var ids = getVirtualCompletedFileIds_();
  var next = [];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== fileId) next.push(ids[i]);
  }
  setVirtualCompletedFileIds_(next);
}

/**
 * fileId를 등록 목록에 추가합니다(이미 있으면 유지).
 * - 권한 확인: DriveApp.getFileById 성공 필요
 * - 허브 규칙([와석초], 생성연도, 시트 MIME) 통과 필요
 * @param {string} fileId
 * @returns {{ ok: boolean, id?: string, item?: Object, alreadyRegistered?: boolean, error?: string }}
 */
function registerSheetById_(fileId) {
  var id = fileId ? String(fileId).trim() : '';
  if (!id) {
    return { ok: false, error: 'fileId 가 필요합니다.' };
  }
  try {
    var file = getDriveFileById_(id);
    var gate = assertDriveObjAllowedForHub_(file);
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }
    var ids = getRegisteredFileIds_();
    var already = false;
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] === id) {
        already = true;
        break;
      }
    }
    if (!already) {
      ids.push(id);
      setRegisteredFileIds_(ids);
    }
    return {
      ok: true,
      id: id,
      item: driveObjToItem_(file),
      alreadyRegistered: already,
    };
  } catch (e) {
    return {
      ok: false,
      error: '해당 시트에 접근할 수 없습니다. 공유 권한 또는 fileId 를 확인하세요.',
    };
  }
}

/**
 * 작성자 표시: Drive User.getName() 우선, 없으면 이메일 @ 앞부분
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {{ author: string, authorEmail: string }}
 */
function resolveAuthorFields_(file) {
  var authorEmail = '';
  var authorName = '';
  try {
    var owner = file.getOwner();
    try {
      authorEmail = owner.getEmail() || '';
    } catch (e0) {}
    try {
      authorName = owner.getName() || '';
    } catch (e1) {}
  } catch (err) {
    return { author: '', authorEmail: '' };
  }
  var author = '';
  if (authorName && String(authorName).trim().length > 0) {
    author = String(authorName).trim();
  } else if (authorEmail && authorEmail.indexOf('@') !== -1) {
    author = authorEmail.split('@')[0];
  } else if (authorEmail) {
    author = authorEmail;
  }
  return { author: author, authorEmail: authorEmail };
}

/**
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {Object}
 */
function fileToItem_(file) {
  var auth = resolveAuthorFields_(file);
  var desc = '';
  try {
    desc = file.getDescription() || '';
  } catch (e2) {
    desc = '';
  }
  return {
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    author: auth.author,
    authorEmail: auth.authorEmail,
    description: desc,
    lastUpdated: file.getLastUpdated().toISOString(),
    createdTime: file.getDateCreated().toISOString(),
  };
}

/**
 * 제목 키워드로 구역 분리 — 취합 우선, 다음 정보
 * @param {Array<Object>} rows name 필드 기준
 * @returns {{ items: Array<Object>, collectItems: Array<Object> }}
 */
function partitionByTitleMarks_(rows) {
  var infoItems = [], collect = [];
  for (var i = 0; i < rows.length; i++) {
    var n = rows[i].name;
    if (n.indexOf(COLLECT_MARK) !== -1) collect.push(rows[i]);
    else if (n.indexOf(INFO_MARK) !== -1) infoItems.push(rows[i]);
  }
  return { items: infoItems, collectItems: collect };
}

/**
 * 완료 폴더 직속 파일 중 허브 규칙에 맞는 스프레드시트
 * Drive API v3 로 검색하므로 공유드라이브 완료 폴더도 지원
 */
function listCompletedFolderSheets_() {
  var folderId = getCompletedFolderId_();
  if (!folderId) return [];
  try {
    var params = {
      q: "'" + folderId + "' in parents and mimeType = '" + SPREADSHEET_MIME + "' and trashed = false",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'nextPageToken, files(id, name, webViewLink, owners, description, modifiedTime, createdTime, mimeType, parents)',
      pageSize: 1000,
    };
    var resp = Drive.Files.list(params);
    var files = resp.files || [];
    var rows = [];
    for (var i = 0; i < files.length; i++) {
      if (driveObjPassesListRules_(files[i])) rows.push(driveObjToItem_(files[i]));
    }
    return sortItemsByLastUpdatedDesc_(rows);
  } catch (e) {
    return [];
  }
}

/**
 * 가상 완료 목록 파일(실제 이동 실패 폴백)을 조회합니다.
 * @returns {Array<Object>}
 */
function listVirtualCompletedSheets_() {
  var ids = getVirtualCompletedFileIds_();
  var rows = [];
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    try {
      var f = getDriveFileById_(id);
      if (driveObjPassesListRules_(f)) {
        rows.push(driveObjToItem_(f));
      }
    } catch (ignore) {}
  }
  return sortItemsByLastUpdatedDesc_(rows);
}

/**
 * 메인 목록 — Drive API v3 도메인 검색
 * corpora: 'domain' 으로 소유자가 열지 않아도 조직 공유 파일이 모두 검색됨
 */
function listWasokSheets() {
  try {
    var doneId = getCompletedFolderId_();
    var virtualDoneIds = getVirtualCompletedFileIds_();
    var virtualDoneMap = {};
    for (var vd = 0; vd < virtualDoneIds.length; vd++) {
      virtualDoneMap[virtualDoneIds[vd]] = true;
    }
    // Drive API v3 쿼리는 'name' 사용 (v2의 'title' 아님)
    var query = "name contains '와석초' and mimeType = '" + SPREADSHEET_MIME + "' and trashed = false";
    var allFiles = searchDomainFiles_(query);
    var byId = {};
    for (var i = 0; i < allFiles.length; i++) {
      var f = allFiles[i];
      if (
        driveObjPassesListRules_(f) &&
        !driveObjIsInFolder_(f, doneId) &&
        !virtualDoneMap[f.id]
      ) {
        byId[f.id] = driveObjToItem_(f);
      }
    }
    var registeredIds = getRegisteredFileIds_();
    for (var i = 0; i < registeredIds.length; i++) {
      var rid = registeredIds[i];
      if (byId[rid]) {
        continue;
      }
      try {
        var rf = getDriveFileById_(rid);
        if (
          driveObjPassesListRules_(rf) &&
          !driveObjIsInFolder_(rf, doneId) &&
          !virtualDoneMap[rid]
        ) {
          byId[rid] = driveObjToItem_(rf);
        }
      } catch (ignore) {}
    }
    var passed = [];
    for (var id in byId) {
      if (Object.prototype.hasOwnProperty.call(byId, id)) {
        passed.push(byId[id]);
      }
    }

    var sorted = sortItemsByLastUpdatedDesc_(passed);
    var parts = partitionByTitleMarks_(sorted);
    parts.items = sortItemsByLastUpdatedDesc_(parts.items);
    parts.collectItems = sortItemsByLastUpdatedDesc_(parts.collectItems);
    var completedById = {};
    var physicalCompleted = listCompletedFolderSheets_();
    for (var pc = 0; pc < physicalCompleted.length; pc++) {
      completedById[physicalCompleted[pc].id] = physicalCompleted[pc];
    }
    var virtualCompleted = listVirtualCompletedSheets_();
    for (var vc = 0; vc < virtualCompleted.length; vc++) {
      completedById[virtualCompleted[vc].id] = virtualCompleted[vc];
    }
    var completedItems = [];
    for (var cid in completedById) {
      if (Object.prototype.hasOwnProperty.call(completedById, cid)) {
        completedItems.push(completedById[cid]);
      }
    }
    completedItems = sortItemsByLastUpdatedDesc_(completedItems);

    return { ok: true, items: parts.items, collectItems: parts.collectItems, completedItems: completedItems };
  } catch (e) {
    return {
      ok: false,
      items: [],
      collectItems: [],
      completedItems: [],
      error: String(e && e.message ? e.message : e),
    };
  }
}

// ── Mutation 함수 (DriveApp 유지 — getFileById 는 도메인 공유 파일도 접근 가능) ──

function saveFileDescription_(fileId, description) {
  if (!fileId) return { ok: false, error: 'fileId 가 필요합니다.' };
  var maxLen = 300;
  var text = description != null ? String(description) : '';
  if (text.length > maxLen) text = text.substring(0, maxLen);
  try {
    var file = DriveApp.getFileById(fileId);
    var gate = assertFileAllowedForDescription_(file);
    if (!gate.ok) return { ok: false, error: gate.error };
    file.setDescription(text);
    return { ok: true, id: fileId, description: text };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function moveFileToCompleted(fileId) {
  if (!fileId) return { ok: false, error: 'fileId 가 필요합니다.' };
  var folderId = getCompletedFolderId_();
  if (!folderId) {
    return {
      ok: false,
      error: '완료 폴더 ID가 없습니다. 스크립트 속성 COMPLETED_FOLDER_ID 또는 DEFAULT_COMPLETED_FOLDER_ID 를 설정하세요.',
    };
  }
  try {
    var file = getDriveFileById_(fileId, 'id, name, mimeType, createdTime, parents');
    var gate = assertDriveObjAllowedForHub_(file);
    if (!gate.ok) return { ok: false, error: gate.error };
    moveDriveFileToFolder_(file, folderId);
    removeVirtualCompletedFileId_(fileId);
    return { ok: true, message: '완료 폴더로 이동했습니다.', id: fileId };
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    // 파일 이동 권한(원본 부모 제거 권한)이 없을 때는 "가상 완료"로 폴백 처리합니다.
    if (msg.indexOf('sufficient permissions') !== -1) {
      addVirtualCompletedFileId_(fileId);
      return {
        ok: true,
        id: fileId,
        message: '이동 권한이 없어 가상 완료로 처리했습니다.',
        moved: false,
        virtualCompleted: true,
      };
    }
    return { ok: false, error: msg };
  }
}

function restoreFileFromCompleted(fileId) {
  if (!fileId) return { ok: false, error: 'fileId 가 필요합니다.' };
  try {
    var file = getDriveFileById_(fileId, 'id, name, mimeType, createdTime, parents');
    var inVirtual = false;
    var vIds = getVirtualCompletedFileIds_();
    for (var i = 0; i < vIds.length; i++) {
      if (vIds[i] === fileId) {
        inVirtual = true;
        break;
      }
    }
    if (!inVirtual) {
      var gate = assertDriveObjRestoreAllowed_(file);
      if (!gate.ok) return { ok: false, error: gate.error };
    }
    var dest = getRestoreTargetFolder_();
    if (inVirtual) {
      removeVirtualCompletedFileId_(fileId);
      return { ok: true, message: '가상 완료에서 되돌렸습니다.', id: fileId, moved: false };
    }
    moveDriveFileToFolder_(file, dest.getId());
    removeVirtualCompletedFileId_(fileId);
    return { ok: true, message: '완료 폴더에서 되돌렸습니다.', id: fileId, moved: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

// ── HTTP 핸들러 ─────────────────────────────────────────────────────────────

function jsonOutput_(payload) {
  var out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = (params.action || 'list').toLowerCase();

  if (action === 'complete' || action === 'move') {
    var gate = assertMutationAllowed_(params.token || '');
    if (!gate.ok) return jsonOutput_(gate);
    return jsonOutput_(moveFileToCompleted(params.fileId || ''));
  }

  if (action === 'restore') {
    var gateR = assertMutationAllowed_(params.token || '');
    if (!gateR.ok) return jsonOutput_(gateR);
    return jsonOutput_(restoreFileFromCompleted(params.fileId || ''));
  }

  return jsonOutput_(listWasokSheets());
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (ignore) {}

  var token = body.token || (e.parameter && e.parameter.token) || '';
  var gate = assertMutationAllowed_(token);
  if (!gate.ok) return jsonOutput_(gate);

  var action = String(body.action || 'complete').toLowerCase();

  if (action === 'savedescription' || action === 'save_description') {
    return jsonOutput_(saveFileDescription_(body.fileId || '', body.description != null ? body.description : ''));
  }

  if (action === 'register' || action === 'registerfile' || action === 'register_file') {
    var regId = body.fileId || '';
    return jsonOutput_(registerSheetById_(regId));
  }

  if (action === 'restore') {
    return jsonOutput_(restoreFileFromCompleted(body.fileId || ''));
  }

  return jsonOutput_(moveFileToCompleted(body.fileId || (e.parameter && e.parameter.fileId) || ''));
}
