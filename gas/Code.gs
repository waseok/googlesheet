/**
 * ============================================================================
 * 와석초 구글 시트 통합 관리 대시보드 (Wasok Sheet Hub) - Google Apps Script
 * ============================================================================
 * 목록 규칙:
 *   - 자동 검색: 제목에 "[와석초]" 포함 스프레드시트만
 *   - 수동 등록: 구글 시트·설문(폼), 제목 무관 / forms.gle·응답 URL도 FormApp으로 해석
 *   - 제목에 "취합"이 있으면 collectItems 로
 *   - 그 외 중 제목에 "정보"가 있으면 items 로
 *   - 수동 등록·폼은 "정보"·"취합"이 없어도 정보 구역에 표시
 *   - completedItems: 완료 폴더 직속·허브 규칙에 맞는 목록 (하단 구역 표시용)
 *
 * [중요] Drive 고급 서비스 활성화 필요:
 *   GAS 편집기 좌측 → 서비스(+) → "Drive API" 추가
 *   → corpora: 'domain' + 'user' 병합 검색 지원
 *   → 스크립트 소유자가 직접 열지 않아도 조직 공유된 파일(domain) + 내가 읽은/접근 가능한 파일(user) 자동 반영
 *
 * 스크립트 속성:
 *   - COMPLETED_FOLDER_ID, MUTATION_TOKEN
 *   - SEARCH_CORPORA (선택, 기본 both) — 목록 자동 검색 범위(domain | user | both)
 *   - RESTORE_FOLDER_ID (선택) — 되돌리기 시 이동할 폴더. 없으면 My Drive 루트
 *   - VIRTUAL_RESTORED_FILE_IDS — 폴더 이동 권한 없이 허브만 되돌린 fileId (자동 관리)
 * ============================================================================
 */

var DEFAULT_COMPLETED_FOLDER_ID = '';
var REQUIRED_TITLE_MARK = '[와석초]';
var COLLECT_MARK = '취합';
var INFO_MARK = '정보';
var SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
var FORM_MIME = 'application/vnd.google-apps.form';
var REGISTERED_FILE_IDS_PROP = 'REGISTERED_FILE_IDS';
/** 수동 등록한 외부 링크(설문 단축 URL 등) — Drive fileId 없이 허브에만 표시 */
var REGISTERED_LINK_ITEMS_PROP = 'REGISTERED_LINK_ITEMS';
var VIRTUAL_COMPLETED_FILE_IDS_PROP = 'VIRTUAL_COMPLETED_FILE_IDS';
/** 완료 폴더에 남아 있어도 허브에서는 진행 중으로 취급(되돌리기 이동 권한 없을 때) */
var VIRTUAL_RESTORED_FILE_IDS_PROP = 'VIRTUAL_RESTORED_FILE_IDS';
var DISMISSED_FILE_IDS_PROP = 'DISMISSED_FILE_IDS';

/**
 * 목록 자동 수집 검색 코퍼스:
 * - script property SEARCH_CORPORA 가 있으면 우선
 *   허용값: domain | user | both
 * - 기본값은 both (조직 검색 + 내 접근기록 기반 검색 병합)
 */
function getSearchCorporaMode_() {
  var v = PropertiesService.getScriptProperties().getProperty('SEARCH_CORPORA');
  if (!v) return 'both';
  v = String(v).toLowerCase().trim();
  if (v === 'domain' || v === 'user' || v === 'both') return v;
  return 'both';
}

/**
 * 현재 SEARCH_CORPORA 모드에서 실제 조회할 corpora 목록
 * @returns {Array<string>}
 */
function getSearchCorporaList_() {
  var mode = getSearchCorporaMode_();
  if (mode === 'domain') return ['domain'];
  if (mode === 'user') return ['user'];
  return ['domain', 'user'];
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
  if (!fileIsInFolder_(file, completedId)) return { ok: false, error: '완료 폴더에 있는 항목만 되돌릴 수 있습니다.' };
  if (!isHubMime_(file.getMimeType())) return { ok: false, error: '구글 시트 또는 설문(폼)만 되돌릴 수 있습니다.' };
  return { ok: true };
}

function assertFileAllowedForHub_(file) {
  if (!isHubMime_(file.getMimeType())) return { ok: false, error: '구글 시트 또는 설문(폼)이 아닙니다.' };
  var name = file.getName() || '';
  if (name.indexOf(REQUIRED_TITLE_MARK) === -1 && !isRegisteredFileId_(file.getId())) {
    return { ok: false, error: '제목에 [와석초]가 있거나, 수동 등록된 항목만 완료 처리할 수 있습니다.' };
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
    isHubMime_(file.getMimeType())
  ) {
    return { ok: true };
  }
  return hub;
}

// ── Drive API v3 객체용 헬퍼 (목록 검색에서 사용) ───────────────────────────

/** 허브에 올릴 수 있는 Drive MIME (시트·설문) */
function isHubMime_(mime) {
  return mime === SPREADSHEET_MIME || mime === FORM_MIME;
}

function hubKindFromMime_(mime) {
  return mime === FORM_MIME ? 'form' : 'sheet';
}

/**
 * 자동 검색용: 시트/폼 MIME + 제목 [와석초]
 */
function driveObjPassesListRules_(f) {
  if (!isHubMime_(f.mimeType)) return false;
  if ((f.name || '').indexOf(REQUIRED_TITLE_MARK) === -1) return false;
  return true;
}

/** 수동 등록용: MIME만 (제목 무관) */
function driveObjPassesRegisterRules_(f) {
  return !!(f && isHubMime_(f.mimeType));
}

function isRegisteredFileId_(fileId) {
  if (!fileId) return false;
  var ids = getRegisteredFileIds_();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] === fileId) return true;
  }
  var links = getRegisteredLinkItems_();
  for (var j = 0; j < links.length; j++) {
    if (links[j].id === fileId) return true;
  }
  return false;
}

function findRegisteredLinkItem_(fileId) {
  var links = getRegisteredLinkItems_();
  for (var i = 0; i < links.length; i++) {
    if (links[i].id === fileId) return links[i];
  }
  return null;
}

/**
 * 완료 폴더·목록에 남을 수 있는지 — 자동 규칙 또는 수동 등록
 */
function driveObjPassesCompletedListRules_(f) {
  if (!f || !isHubMime_(f.mimeType)) return false;
  if ((f.name || '').indexOf(REQUIRED_TITLE_MARK) !== -1) return true;
  return isRegisteredFileId_(f.id);
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
    kind: hubKindFromMime_(f.mimeType),
    mimeType: f.mimeType || '',
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
 * 완료·설명 등 허브 작업 — 자동([와석초]) 또는 수동 등록 항목
 */
function assertDriveObjAllowedForHub_(f) {
  if (!f || !isHubMime_(f.mimeType)) {
    return { ok: false, error: '구글 시트 또는 설문(폼)이 아닙니다.' };
  }
  if ((f.name || '').indexOf(REQUIRED_TITLE_MARK) === -1 && !isRegisteredFileId_(f.id)) {
    return { ok: false, error: '제목에 [와석초]가 있거나, 수동 등록된 항목만 처리할 수 있습니다.' };
  }
  return { ok: true };
}

/** 수동 등록 — 제목 무관, 시트·폼 MIME만 */
function assertDriveObjAllowedForRegister_(f) {
  if (!driveObjPassesRegisterRules_(f)) {
    return { ok: false, error: '구글 시트 또는 설문(폼)만 등록할 수 있습니다.' };
  }
  return { ok: true };
}

/**
 * 완료 폴더에 있는 시트·폼만 복원 허용 (제목 무관 — 수동 등록분 포함)
 */
function assertDriveObjRestoreAllowed_(f) {
  var completedId = getCompletedFolderId_();
  if (!completedId) {
    return { ok: false, error: 'COMPLETED_FOLDER_ID 가 설정되어 있어야 합니다.' };
  }
  if (!driveObjIsInFolder_(f, completedId)) {
    return { ok: false, error: '완료 폴더에 있는 항목만 되돌릴 수 있습니다.' };
  }
  if (!f || !isHubMime_(f.mimeType)) {
    return { ok: false, error: '구글 시트 또는 설문(폼)만 되돌릴 수 있습니다.' };
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
  var byId = {};
  var corporaList = getSearchCorporaList_();
  for (var c = 0; c < corporaList.length; c++) {
    var pageToken = null;
    var corpora = corporaList[c];
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
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (f && f.id && !byId[f.id]) {
          byId[f.id] = true;
          allFiles.push(f);
        }
      }
      pageToken = resp.nextPageToken || null;
    } while (pageToken);
  }
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
 * 링크만 등록된 항목(forms.gle 등 Drive fileId 없이 허브 표시)
 * @returns {Array<Object>}
 */
function getRegisteredLinkItems_() {
  var raw = PropertiesService.getScriptProperties().getProperty(REGISTERED_LINK_ITEMS_PROP);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < parsed.length; i++) {
      var row = parsed[i];
      if (!row || typeof row !== 'object') continue;
      var id = row.id ? String(row.id).trim() : '';
      var url = row.url ? String(row.url).trim() : '';
      var name = row.name ? String(row.name).trim() : '';
      if (!id || !url || seen[id]) continue;
      seen[id] = true;
      out.push({
        id: id,
        name: name || '설문 링크',
        url: url,
        author: row.author ? String(row.author) : '',
        authorEmail: '',
        description: row.description ? String(row.description) : '',
        lastUpdated: row.lastUpdated || new Date().toISOString(),
        createdTime: row.createdTime || row.lastUpdated || new Date().toISOString(),
        kind: row.kind === 'sheet' ? 'sheet' : 'form',
        mimeType: row.kind === 'sheet' ? SPREADSHEET_MIME : FORM_MIME,
        linkOnly: true,
      });
    }
    return out;
  } catch (e) {
    return [];
  }
}

function setRegisteredLinkItems_(items) {
  var out = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var row = items[i];
    if (!row || !row.id || !row.url) continue;
    var id = String(row.id).trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push({
      id: id,
      name: row.name || '설문 링크',
      url: String(row.url).trim(),
      author: row.author || '',
      description: row.description || '',
      lastUpdated: row.lastUpdated || new Date().toISOString(),
      createdTime: row.createdTime || new Date().toISOString(),
      kind: row.kind === 'sheet' ? 'sheet' : 'form',
    });
  }
  PropertiesService.getScriptProperties().setProperty(
    REGISTERED_LINK_ITEMS_PROP,
    JSON.stringify(out)
  );
}

function upsertRegisteredLinkItem_(item) {
  var items = getRegisteredLinkItems_();
  var found = false;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id === item.id) {
      items[i] = item;
      found = true;
      break;
    }
  }
  if (!found) items.push(item);
  setRegisteredLinkItems_(items);
  return found;
}

function removeRegisteredLinkItem_(fileId) {
  var items = getRegisteredLinkItems_();
  var next = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].id !== fileId) next.push(items[i]);
  }
  setRegisteredLinkItems_(next);
}

function isLinkOnlyId_(fileId) {
  return String(fileId || '').indexOf('gle_') === 0 || String(fileId || '').indexOf('link_') === 0;
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
 * 허브 목록에서 숨긴 fileId 목록(JSON 배열)
 * @returns {Array<string>}
 */
function getDismissedFileIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty(DISMISSED_FILE_IDS_PROP);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
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
 * @param {Array<string>} ids
 */
function setDismissedFileIds_(ids) {
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
    DISMISSED_FILE_IDS_PROP,
    JSON.stringify(out)
  );
}

function addDismissedFileId_(fileId) {
  var ids = getDismissedFileIds_();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] === fileId) return;
  }
  ids.push(fileId);
  setDismissedFileIds_(ids);
}

function removeDismissedFileId_(fileId) {
  var ids = getDismissedFileIds_();
  var next = [];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== fileId) next.push(ids[i]);
  }
  setDismissedFileIds_(next);
}

/**
 * 가상 되돌림 fileId 목록 — Drive 이동 권한이 없어도 완료 폴더에서 진행 중으로 되돌릴 때 사용
 * @returns {Array<string>}
 */
function getVirtualRestoredFileIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty(VIRTUAL_RESTORED_FILE_IDS_PROP);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
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

function setVirtualRestoredFileIds_(ids) {
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
    VIRTUAL_RESTORED_FILE_IDS_PROP,
    JSON.stringify(out)
  );
}

function addVirtualRestoredFileId_(fileId) {
  var ids = getVirtualRestoredFileIds_();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] === fileId) return;
  }
  ids.push(fileId);
  setVirtualRestoredFileIds_(ids);
}

function removeVirtualRestoredFileId_(fileId) {
  var ids = getVirtualRestoredFileIds_();
  var next = [];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== fileId) next.push(ids[i]);
  }
  setVirtualRestoredFileIds_(next);
}

function buildIdMap_(ids) {
  var map = {};
  for (var i = 0; i < ids.length; i++) {
    map[ids[i]] = true;
  }
  return map;
}

/**
 * URL 리다이렉트를 따라가 최종 주소를 구합니다.
 * @param {string} startUrl
 * @returns {string}
 */
function expandUrlRedirects_(startUrl) {
  var url = startUrl;
  for (var hop = 0; hop < 6; hop++) {
    if (!/forms\.gle\//i.test(url) && /docs\.google\.com\//i.test(url)) {
      return url;
    }
    try {
      var resp = UrlFetchApp.fetch(url, {
        followRedirects: false,
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      var code = resp.getResponseCode();
      var headers = resp.getHeaders();
      var loc = headers.Location || headers.location || '';
      if (!loc || (code < 300 || code >= 400)) {
        return url;
      }
      if (loc.indexOf('http') !== 0) {
        var baseMatch = url.match(/^(https?:\/\/[^/]+)/i);
        var base = baseMatch ? baseMatch[1] : '';
        loc = loc.charAt(0) === '/' ? base + loc : url.replace(/\/[^/]*$/, '/') + loc;
      }
      url = loc;
    } catch (e) {
      return url;
    }
  }
  return url;
}

function makeGleLinkId_(url) {
  var m = String(url).match(/forms\.gle\/([A-Za-z0-9_-]+)/i);
  if (m && m[1]) return 'gle_' + m[1];
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(url),
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < digest.length && hex.length < 24; i++) {
    var b = digest[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    hex += h.length === 1 ? '0' + h : h;
  }
  return 'link_' + hex;
}

/**
 * URL·단축링크·fileId → Drive fileId
 * forms.gle 은 FormApp으로 해석을 시도하고, 실패하면 linkOnly 등록용 힌트를 남깁니다.
 * @returns {{ ok: boolean, id?: string, error?: string, linkOnly?: boolean, url?: string, name?: string }}
 */
function resolveFileIdFromInput_(raw) {
  var text = String(raw || '').trim();
  if (!text) {
    return { ok: false, error: 'URL 또는 fileId 가 필요합니다.' };
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(text) && text.indexOf('/') === -1) {
    return { ok: true, id: text };
  }

  var sheet = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheet && sheet[1]) {
    return { ok: true, id: sheet[1] };
  }

  var formEdit = text.match(/\/forms\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
  if (formEdit && formEdit[1]) {
    return { ok: true, id: formEdit[1] };
  }

  var url = text;
  if (url.indexOf('http') !== 0) {
    if (/^forms\.gle\//i.test(url)) url = 'https://' + url;
    else if (/^docs\.google\.com\//i.test(url)) url = 'https://' + url;
  }

  var isFormShare =
    /forms\.gle\//i.test(url) ||
    /docs\.google\.com\/forms\//i.test(url) ||
    /forms\.google\.com\//i.test(url);

  if (/forms\.gle\//i.test(url)) {
    url = expandUrlRedirects_(url);
    var formEdit2 = url.match(/\/forms\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
    if (formEdit2 && formEdit2[1]) {
      return { ok: true, id: formEdit2[1] };
    }
  }

  if (isFormShare) {
    var tryUrls = [url];
    if (String(raw).indexOf('http') === 0 && String(raw).trim() !== url) {
      tryUrls.push(String(raw).trim());
    }
    for (var t = 0; t < tryUrls.length; t++) {
      try {
        var form = FormApp.openByUrl(tryUrls[t]);
        return { ok: true, id: form.getId() };
      } catch (formErr) {}
    }
    // 응답/단축 링크는 Drive fileId를 못 얻는 경우가 많음 → 링크만 등록
    return {
      ok: true,
      linkOnly: true,
      id: makeGleLinkId_(text.indexOf('http') === 0 ? text : url),
      url: text.indexOf('http') === 0 ? text : url,
      name: '설문 링크',
    };
  }

  try {
    var ss = SpreadsheetApp.openByUrl(url);
    return { ok: true, id: ss.getId() };
  } catch (sheetErr) {}

  return {
    ok: false,
    error: '올바른 시트·설문 URL 또는 fileId가 아닙니다.',
  };
}

/**
 * fileId를 등록 목록에 추가합니다(이미 있으면 유지).
 * - fileId 또는 시트/설문 URL(forms.gle 포함) 입력 가능
 * - forms.gle 해석 실패 시에도 링크만 허브에 등록 가능
 */
function registerSheetById_(fileId) {
  var resolved = resolveFileIdFromInput_(fileId);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  // Drive fileId 없이 설문 단축 링크만 등록
  if (resolved.linkOnly) {
    var linkItem = {
      id: resolved.id,
      name: resolved.name || '설문 링크',
      url: resolved.url,
      author: '',
      description: '',
      lastUpdated: new Date().toISOString(),
      createdTime: new Date().toISOString(),
      kind: 'form',
      mimeType: FORM_MIME,
      linkOnly: true,
    };
    var alreadyLink = upsertRegisteredLinkItem_(linkItem);
    removeDismissedFileId_(resolved.id);
    removeVirtualCompletedFileId_(resolved.id);
    return {
      ok: true,
      id: resolved.id,
      item: linkItem,
      alreadyRegistered: alreadyLink,
      linkOnly: true,
      message: alreadyLink
        ? '이미 등록된 설문 링크입니다.'
        : '설문 단축 링크를 허브에 등록했습니다. (Drive 파일이 아닌 링크 등록)',
    };
  }

  var id = resolved.id;
  try {
    var file = getDriveFileById_(id);
    var gate = assertDriveObjAllowedForRegister_(file);
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
    removeDismissedFileId_(id);
    removeRegisteredLinkItem_(id);
    return {
      ok: true,
      id: id,
      item: driveObjToItem_(file),
      alreadyRegistered: already,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        '해당 파일에 접근할 수 없습니다. 공유 권한 또는 URL을 확인하세요.',
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
    kind: hubKindFromMime_(file.getMimeType()),
    mimeType: file.getMimeType() || '',
  };
}

/**
 * 제목 키워드로 구역 분리 — 취합 우선, 다음 정보
 * 수동 등록·폼은 정보·취합 키워드가 없어도 정보 구역에 넣습니다.
 * @param {Array<Object>} rows
 * @param {Object=} registeredMap fileId → true
 */
function partitionByTitleMarks_(rows, registeredMap) {
  var reg = registeredMap || {};
  var infoItems = [], collect = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var n = row.name || '';
    if (n.indexOf(COLLECT_MARK) !== -1) collect.push(row);
    else if (n.indexOf(INFO_MARK) !== -1) infoItems.push(row);
    else if (row.kind === 'form' || reg[row.id]) infoItems.push(row);
  }
  return { items: infoItems, collectItems: collect };
}

/**
 * 완료 폴더 직속 파일 중 허브 규칙에 맞는 시트·폼
 * Drive API v3 로 검색하므로 공유드라이브 완료 폴더도 지원
 */
function listCompletedFolderSheets_() {
  var folderId = getCompletedFolderId_();
  if (!folderId) return [];
  try {
    var params = {
      q: "'" + folderId + "' in parents and (mimeType = '" + SPREADSHEET_MIME + "' or mimeType = '" + FORM_MIME + "') and trashed = false",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: 'nextPageToken, files(id, name, webViewLink, owners, description, modifiedTime, createdTime, mimeType, parents)',
      pageSize: 1000,
    };
    var resp = Drive.Files.list(params);
    var files = resp.files || [];
    var rows = [];
    for (var i = 0; i < files.length; i++) {
      if (driveObjPassesCompletedListRules_(files[i])) rows.push(driveObjToItem_(files[i]));
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
    var linkItem = findRegisteredLinkItem_(id);
    if (linkItem) {
      rows.push(linkItem);
      continue;
    }
    try {
      var f = getDriveFileById_(id);
      if (driveObjPassesCompletedListRules_(f) || driveObjPassesRegisterRules_(f)) {
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
/**
 * 진행 중 목록(자동 검색) — [와석초] 규칙 + 완료/숨김 제외
 */
function shouldListAsActive_(f, doneId, virtualDoneMap, virtualRestoredMap, dismissedMap) {
  if (!driveObjPassesListRules_(f)) return false;
  if (dismissedMap[f.id]) return false;
  if (virtualDoneMap[f.id] && !virtualRestoredMap[f.id]) return false;
  if (driveObjIsInFolder_(f, doneId) && !virtualRestoredMap[f.id]) return false;
  return true;
}

/**
 * 진행 중 목록(수동 등록) — 제목 무관, MIME만
 */
function shouldListRegisteredAsActive_(f, doneId, virtualDoneMap, virtualRestoredMap, dismissedMap) {
  if (!driveObjPassesRegisterRules_(f)) return false;
  if (dismissedMap[f.id]) return false;
  if (virtualDoneMap[f.id] && !virtualRestoredMap[f.id]) return false;
  if (driveObjIsInFolder_(f, doneId) && !virtualRestoredMap[f.id]) return false;
  return true;
}

function listWasokSheets() {
  try {
    var doneId = getCompletedFolderId_();
    var virtualDoneIds = getVirtualCompletedFileIds_();
    var virtualDoneMap = buildIdMap_(virtualDoneIds);
    var virtualRestoredMap = buildIdMap_(getVirtualRestoredFileIds_());
    var dismissedMap = buildIdMap_(getDismissedFileIds_());
    var registeredIds = getRegisteredFileIds_();
    var registeredMap = buildIdMap_(registeredIds);
    var linkItems = getRegisteredLinkItems_();
    for (var li = 0; li < linkItems.length; li++) {
      registeredMap[linkItems[li].id] = true;
    }
    // 자동 검색: [와석초] 시트만. 설문·제목 없는 항목은 수동 등록.
    var query = "name contains '와석초' and mimeType = '" + SPREADSHEET_MIME + "' and trashed = false";
    var allFiles = searchDomainFiles_(query);
    var byId = {};
    for (var i = 0; i < allFiles.length; i++) {
      var f = allFiles[i];
      if (shouldListAsActive_(f, doneId, virtualDoneMap, virtualRestoredMap, dismissedMap)) {
        byId[f.id] = driveObjToItem_(f);
      }
    }
    for (var i = 0; i < registeredIds.length; i++) {
      var rid = registeredIds[i];
      if (byId[rid] || dismissedMap[rid]) {
        continue;
      }
      try {
        var rf = getDriveFileById_(rid);
        if (shouldListRegisteredAsActive_(rf, doneId, virtualDoneMap, virtualRestoredMap, dismissedMap)) {
          byId[rid] = driveObjToItem_(rf);
        }
      } catch (ignore) {}
    }
    // forms.gle 등 링크만 등록된 설문
    for (var lj = 0; lj < linkItems.length; lj++) {
      var link = linkItems[lj];
      if (dismissedMap[link.id]) continue;
      if (virtualDoneMap[link.id] && !virtualRestoredMap[link.id]) continue;
      if (!byId[link.id]) byId[link.id] = link;
    }
    // 가상 되돌림인데 검색/등록에 안 잡힌 경우 Drive에서 단건으로 보강
    var virtualRestoredIds = getVirtualRestoredFileIds_();
    for (var vr = 0; vr < virtualRestoredIds.length; vr++) {
      var vrid = virtualRestoredIds[vr];
      if (byId[vrid] || dismissedMap[vrid]) continue;
      var restoredLink = findRegisteredLinkItem_(vrid);
      if (restoredLink) {
        byId[vrid] = restoredLink;
        continue;
      }
      try {
        var vrf = getDriveFileById_(vrid);
        if (driveObjPassesRegisterRules_(vrf) || driveObjPassesListRules_(vrf)) {
          byId[vrid] = driveObjToItem_(vrf);
        }
      } catch (ignore2) {}
    }
    var passed = [];
    for (var id in byId) {
      if (Object.prototype.hasOwnProperty.call(byId, id)) {
        passed.push(byId[id]);
      }
    }

    var sorted = sortItemsByLastUpdatedDesc_(passed);
    var parts = partitionByTitleMarks_(sorted, registeredMap);
    parts.items = sortItemsByLastUpdatedDesc_(parts.items);
    parts.collectItems = sortItemsByLastUpdatedDesc_(parts.collectItems);
    var completedById = {};
    var physicalCompleted = listCompletedFolderSheets_();
    for (var pc = 0; pc < physicalCompleted.length; pc++) {
      var pcItem = physicalCompleted[pc];
      if (!dismissedMap[pcItem.id] && !virtualRestoredMap[pcItem.id]) {
        completedById[pcItem.id] = pcItem;
      }
    }
    var virtualCompleted = listVirtualCompletedSheets_();
    for (var vc = 0; vc < virtualCompleted.length; vc++) {
      var vcItem = virtualCompleted[vc];
      if (!dismissedMap[vcItem.id] && !virtualRestoredMap[vcItem.id]) {
        completedById[vcItem.id] = vcItem;
      }
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

  var linkItem = findRegisteredLinkItem_(fileId);
  if (linkItem) {
    linkItem.description = text;
    linkItem.lastUpdated = new Date().toISOString();
    upsertRegisteredLinkItem_(linkItem);
    return { ok: true, id: fileId, description: text };
  }

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

  // forms.gle 링크 등록분은 Drive 이동 없이 가상 완료
  if (findRegisteredLinkItem_(fileId) || isLinkOnlyId_(fileId)) {
    addVirtualCompletedFileId_(fileId);
    removeVirtualRestoredFileId_(fileId);
    removeDismissedFileId_(fileId);
    return {
      ok: true,
      id: fileId,
      message: '설문 링크를 완료 처리했습니다.',
      moved: false,
      virtualCompleted: true,
    };
  }

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
    removeVirtualRestoredFileId_(fileId);
    removeDismissedFileId_(fileId);
    return { ok: true, message: '완료 폴더로 이동했습니다.', id: fileId };
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    if (msg.indexOf('sufficient permissions') !== -1) {
      addVirtualCompletedFileId_(fileId);
      removeVirtualRestoredFileId_(fileId);
      removeDismissedFileId_(fileId);
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

/**
 * 완료 폴더 항목을 허브 목록에서만 숨깁니다(드라이브 파일은 삭제하지 않음).
 */
function dismissFromHub_(fileId) {
  if (!fileId) return { ok: false, error: 'fileId 가 필요합니다.' };

  if (findRegisteredLinkItem_(fileId) || isLinkOnlyId_(fileId)) {
    var vIdsLink = getVirtualCompletedFileIds_();
    var inVirtualLink = false;
    for (var vi = 0; vi < vIdsLink.length; vi++) {
      if (vIdsLink[vi] === fileId) {
        inVirtualLink = true;
        break;
      }
    }
    if (!inVirtualLink) {
      return { ok: false, error: '완료 처리된 항목만 목록에서 삭제할 수 있습니다.' };
    }
    removeVirtualCompletedFileId_(fileId);
    addDismissedFileId_(fileId);
    return { ok: true, message: '허브 목록에서 삭제했습니다.', id: fileId };
  }

  try {
    var file = getDriveFileById_(fileId, 'id, name, mimeType, parents');
    if ((file.name || '').indexOf(REQUIRED_TITLE_MARK) === -1 && !isRegisteredFileId_(fileId)) {
      return { ok: false, error: '제목에 [와석초]가 있거나, 수동 등록된 항목만 목록에서 삭제할 수 있습니다.' };
    }
    var folderId = getCompletedFolderId_();
    var inVirtual = false;
    var vIds = getVirtualCompletedFileIds_();
    for (var i = 0; i < vIds.length; i++) {
      if (vIds[i] === fileId) {
        inVirtual = true;
        break;
      }
    }
    var inCompleted = folderId && driveObjIsInFolder_(file, folderId);
    if (!inVirtual && !inCompleted) {
      return { ok: false, error: '완료 폴더에 있는 항목만 목록에서 삭제할 수 있습니다.' };
    }
    removeVirtualCompletedFileId_(fileId);
    addDismissedFileId_(fileId);
    return { ok: true, message: '허브 목록에서 삭제했습니다.', id: fileId };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function restoreFileFromCompleted(fileId) {
  if (!fileId) return { ok: false, error: 'fileId 가 필요합니다.' };

  if (findRegisteredLinkItem_(fileId) || isLinkOnlyId_(fileId)) {
    removeVirtualCompletedFileId_(fileId);
    removeVirtualRestoredFileId_(fileId);
    removeDismissedFileId_(fileId);
    return { ok: true, message: '설문 링크를 되돌렸습니다.', id: fileId, moved: false };
  }

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
    if (inVirtual) {
      removeVirtualCompletedFileId_(fileId);
      removeVirtualRestoredFileId_(fileId);
      removeDismissedFileId_(fileId);
      return { ok: true, message: '가상 완료에서 되돌렸습니다.', id: fileId, moved: false };
    }
    try {
      var dest = getRestoreTargetFolder_();
      moveDriveFileToFolder_(file, dest.getId());
      removeVirtualCompletedFileId_(fileId);
      removeVirtualRestoredFileId_(fileId);
      removeDismissedFileId_(fileId);
      return { ok: true, message: '완료 폴더에서 되돌렸습니다.', id: fileId, moved: true };
    } catch (moveErr) {
      var moveMsg = String(moveErr && moveErr.message ? moveErr.message : moveErr);
      if (moveMsg.indexOf('sufficient permissions') !== -1) {
        removeVirtualCompletedFileId_(fileId);
        addVirtualRestoredFileId_(fileId);
        removeDismissedFileId_(fileId);
        return {
          ok: true,
          id: fileId,
          message: '이동 권한이 없어 허브 목록만 되돌렸습니다. (드라이브 파일은 완료 폴더에 남을 수 있습니다.)',
          moved: false,
          virtualRestored: true,
        };
      }
      return { ok: false, error: moveMsg };
    }
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

  if (action === 'dismiss' || action === 'remove') {
    var gateD = assertMutationAllowed_(params.token || '');
    if (!gateD.ok) return jsonOutput_(gateD);
    return jsonOutput_(dismissFromHub_(params.fileId || ''));
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

  if (action === 'dismiss' || action === 'remove') {
    return jsonOutput_(dismissFromHub_(body.fileId || ''));
  }

  return jsonOutput_(moveFileToCompleted(body.fileId || (e.parameter && e.parameter.fileId) || ''));
}
