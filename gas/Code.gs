/**
 * ============================================================================
 * 와석초 구글 시트 통합 관리 대시보드 (Wasok Sheet Hub) - Google Apps Script
 * ============================================================================
 * 목록 규칙:
 *   - 제목에 대괄호 포함 문자열 "[와석초]" 가 정확히 들어간 스프레드시트만 (와석초 단독 제외)
 *   - 생성일(getDateCreated)이 LIST_YEAR 연도인 것만
 *   - 제목에 "취합"이 있으면 collectItems 로
 *   - 그 외 중 제목에 "정보"가 있으면 items(정보 시트 구역)로. 둘 다 없으면 허브 목록에 표시하지 않음
 *   - author: 소유자 표시 이름(getName), 없으면 이메일 @ 앞부분 / authorEmail / description: Drive 파일 설명
 *   - 설명 저장: POST JSON … description 최대 300자 → Drive setDescription (완료 폴더 내 시트 포함)
 *   - completedItems: 완료 폴더 직속·허브 규칙에 맞는 시트 목록 (하단 구역 표시용)
 *   - 전체 Drive 검색 목록에서는 완료 폴더 안에 있는 파일은 제외(중복 방지)
 *
 * 스크립트 속성:
 *   - COMPLETED_FOLDER_ID, MUTATION_TOKEN (기존과 동일)
 *   - LIST_YEAR (선택, 기본 2026) — 생성 연도 필터
 *   - RESTORE_FOLDER_ID (선택) — 되돌리기 시 이동할 폴더. 없으면 실행 계정 My Drive 루트
 *
 * Drive 검색은 title contains '와석초' 로 후보를 넓게 가져온 뒤, 스크립트에서 위 규칙으로 엄격 필터합니다.
 * (쿼리만 title contains '[와석초]' 로 두면 Drive 쪽에서 대괄호 해석이 달라질 수 있어 후보+필터 방식을 씁니다.)
 * ============================================================================
 */

var DEFAULT_COMPLETED_FOLDER_ID = '';

/** 목록·완료 검증에 쓰는 생성 연도 (스크립트 속성 LIST_YEAR 가 있으면 우선) */
var DEFAULT_LIST_YEAR = 2026;

/** 제목에 반드시 포함되어야 하는 문자열(대괄호 포함) */
var REQUIRED_TITLE_MARK = '[와석초]';

/** 제목에 포함되면 "취합" 구역으로 분류(정보와 동시에 있으면 취합 우선) */
var COLLECT_MARK = '취합';

/** 제목에 포함되면 "정보 시트" 구역(items)으로 분류 — 취합이 없을 때만 */
var INFO_MARK = '정보';

var SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

function getCompletedFolderId_() {
  var id = PropertiesService.getScriptProperties().getProperty('COMPLETED_FOLDER_ID');
  if (id && id.length > 0) {
    return id;
  }
  return DEFAULT_COMPLETED_FOLDER_ID || '';
}

/**
 * 되돌리기 대상 폴더 (RESTORE_FOLDER_ID 없으면 루트)
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getRestoreTargetFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('RESTORE_FOLDER_ID');
  if (id && id.length > 0) {
    return DriveApp.getFolderById(id);
  }
  return DriveApp.getRootFolder();
}

/**
 * 완료 폴더에 있는 [와석초] 스프레드시트만 되돌리기 허용(생성연도 무관)
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {{ ok: boolean, error?: string }}
 */
function assertRestoreAllowed_(file) {
  var completedId = getCompletedFolderId_();
  if (!completedId) {
    return { ok: false, error: 'COMPLETED_FOLDER_ID 가 설정되어 있어야 합니다.' };
  }
  if (!fileIsInFolder_(file, completedId)) {
    return { ok: false, error: '완료 폴더에 있는 시트만 되돌릴 수 있습니다.' };
  }
  if (file.getMimeType() !== SPREADSHEET_MIME) {
    return { ok: false, error: '스프레드시트만 되돌릴 수 있습니다.' };
  }
  if (file.getName().indexOf(REQUIRED_TITLE_MARK) === -1) {
    return { ok: false, error: '제목에 [와석초]가 포함된 시트만 되돌릴 수 있습니다.' };
  }
  return { ok: true };
}

function getMutationToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('MUTATION_TOKEN');
  return t && t.length > 0 ? t : '';
}

/** @returns {number} */
function getListYear_() {
  var y = PropertiesService.getScriptProperties().getProperty('LIST_YEAR');
  if (y && /^\d{4}$/.test(y)) {
    return parseInt(y, 10);
  }
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

/**
 * Drive 후보 검색 쿼리 (스크립트에서 [와석초]·연도·MIME 재검증)
 * @returns {string}
 */
function buildLooseSearchQuery_() {
  return (
    "title contains '와석초' and mimeType = '" +
    SPREADSHEET_MIME +
    "' and trashed = false"
  );
}

/**
 * 허브 규칙: 스프레드시트, 제목에 "[와석초]" 부분 문자열, 생성 연도
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {boolean}
 */
function filePassesListRules_(file) {
  if (file.getMimeType() !== SPREADSHEET_MIME) {
    return false;
  }
  var name = file.getName();
  if (name.indexOf(REQUIRED_TITLE_MARK) === -1) {
    return false;
  }
  var year = file.getDateCreated().getFullYear();
  return year === getListYear_();
}

/**
 * 완료 이동 전 동일 규칙 검증
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {{ ok: boolean, error?: string }}
 */
function assertFileAllowedForHub_(file) {
  if (file.getMimeType() !== SPREADSHEET_MIME) {
    return { ok: false, error: '스프레드시트가 아닙니다.' };
  }
  var name = file.getName();
  if (name.indexOf(REQUIRED_TITLE_MARK) === -1) {
    return { ok: false, error: '제목에 [와석초]가 포함된 시트만 완료 처리할 수 있습니다.' };
  }
  var y = file.getDateCreated().getFullYear();
  if (y !== getListYear_()) {
    return {
      ok: false,
      error: getListYear_() + '년에 생성된 시트만 완료 처리할 수 있습니다.',
    };
  }
  return { ok: true };
}

/**
 * 파일의 상위 폴더 중 id 가 folderId 인 것이 있는지
 * @param {GoogleAppsScript.Drive.File} file
 * @param {string} folderId
 * @returns {boolean}
 */
function fileIsInFolder_(file, folderId) {
  if (!folderId) {
    return false;
  }
  try {
    var it = file.getParents();
    while (it.hasNext()) {
      if (it.next().getId() === folderId) {
        return true;
      }
    }
  } catch (e) {
    return false;
  }
  return false;
}

/**
 * 허브 규칙 통과 시트 또는 완료 폴더 안의 [와석초] 스프레드시트만 설명 저장 허용
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {{ ok: boolean, error?: string }}
 */
function assertFileAllowedForDescription_(file) {
  var hub = assertFileAllowedForHub_(file);
  if (hub.ok) {
    return hub;
  }
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

function sortItemsByLastUpdatedDesc_(items) {
  return items.slice().sort(function (a, b) {
    if (a.lastUpdated < b.lastUpdated) return 1;
    if (a.lastUpdated > b.lastUpdated) return -1;
    return 0;
  });
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
  var infoItems = [];
  var collect = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var n = row.name;
    if (n.indexOf(COLLECT_MARK) !== -1) {
      collect.push(row);
    } else if (n.indexOf(INFO_MARK) !== -1) {
      infoItems.push(row);
    }
  }
  return { items: infoItems, collectItems: collect };
}

/**
 * 완료 폴더 직속 파일 중 허브 규칙에 맞는 스프레드시트
 * @returns {Array<Object>}
 */
function listCompletedFolderSheets_() {
  var folderId = getCompletedFolderId_();
  if (!folderId) {
    return [];
  }
  try {
    var folder = DriveApp.getFolderById(folderId);
    var it = folder.getFiles();
    var rows = [];
    while (it.hasNext()) {
      var f = it.next();
      if (filePassesListRules_(f)) {
        rows.push(fileToItem_(f));
      }
    }
    return sortItemsByLastUpdatedDesc_(rows);
  } catch (e) {
    return [];
  }
}

/**
 * @returns {{ ok: boolean, items: Array<Object>, collectItems: Array<Object>, completedItems: Array<Object>, error?: string }}
 */
function listWasokSheets() {
  try {
    var doneId = getCompletedFolderId_();
    var query = buildLooseSearchQuery_();
    var iterator = DriveApp.searchFiles(query);
    var passed = [];
    while (iterator.hasNext()) {
      var file = iterator.next();
      if (filePassesListRules_(file) && !fileIsInFolder_(file, doneId)) {
        passed.push(fileToItem_(file));
      }
    }
    var sorted = sortItemsByLastUpdatedDesc_(passed);
    var parts = partitionByTitleMarks_(sorted);
    parts.items = sortItemsByLastUpdatedDesc_(parts.items);
    parts.collectItems = sortItemsByLastUpdatedDesc_(parts.collectItems);
    var completedItems = listCompletedFolderSheets_();
    return {
      ok: true,
      items: parts.items,
      collectItems: parts.collectItems,
      completedItems: completedItems,
    };
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

/**
 * 웹에서 입력한 설명을 Drive 파일 설명에 저장합니다(목록 규칙 통과 시트만).
 * @param {string} fileId
 * @param {string} description
 * @returns {{ ok: boolean, id?: string, description?: string, error?: string }}
 */
function saveFileDescription_(fileId, description) {
  if (!fileId) {
    return { ok: false, error: 'fileId 가 필요합니다.' };
  }
  var maxLen = 300;
  var text = description != null ? String(description) : '';
  if (text.length > maxLen) {
    text = text.substring(0, maxLen);
  }
  try {
    var file = DriveApp.getFileById(fileId);
    var gate = assertFileAllowedForDescription_(file);
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }
    file.setDescription(text);
    return { ok: true, id: fileId, description: text };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function moveFileToCompleted(fileId) {
  if (!fileId) {
    return { ok: false, error: 'fileId 가 필요합니다.' };
  }
  var folderId = getCompletedFolderId_();
  if (!folderId) {
    return {
      ok: false,
      error:
        '완료 폴더 ID가 없습니다. 스크립트 속성 COMPLETED_FOLDER_ID 또는 DEFAULT_COMPLETED_FOLDER_ID 를 설정하세요.',
    };
  }

  try {
    var file = DriveApp.getFileById(fileId);
    var gate = assertFileAllowedForHub_(file);
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }

    var targetFolder = DriveApp.getFolderById(folderId);
    var parents = file.getParents();
    while (parents.hasNext()) {
      parents.next().removeFile(file);
    }
    targetFolder.addFile(file);

    return { ok: true, message: '완료 폴더로 이동했습니다.', id: fileId };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

/**
 * 완료 폴더에서 복원 폴더(또는 루트)로 이동
 * @param {string} fileId
 * @returns {{ ok: boolean, message?: string, id?: string, error?: string }}
 */
function restoreFileFromCompleted(fileId) {
  if (!fileId) {
    return { ok: false, error: 'fileId 가 필요합니다.' };
  }
  try {
    var file = DriveApp.getFileById(fileId);
    var gate = assertRestoreAllowed_(file);
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }
    var dest = getRestoreTargetFolder_();
    var parents = file.getParents();
    while (parents.hasNext()) {
      parents.next().removeFile(file);
    }
    dest.addFile(file);
    return { ok: true, message: '완료 폴더에서 되돌렸습니다.', id: fileId };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

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
    if (!gate.ok) {
      return jsonOutput_(gate);
    }
    var fileId = params.fileId || '';
    return jsonOutput_(moveFileToCompleted(fileId));
  }

  if (action === 'restore') {
    var gateR = assertMutationAllowed_(params.token || '');
    if (!gateR.ok) {
      return jsonOutput_(gateR);
    }
    var rid = params.fileId || '';
    return jsonOutput_(restoreFileFromCompleted(rid));
  }

  return jsonOutput_(listWasokSheets());
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (ignore) {
    body = {};
  }
  var token = body.token || (e.parameter && e.parameter.token) || '';
  var gate = assertMutationAllowed_(token);
  if (!gate.ok) {
    return jsonOutput_(gate);
  }

  var action = String(body.action || 'complete').toLowerCase();
  if (action === 'savedescription' || action === 'save_description') {
    var sid = body.fileId || '';
    var sdesc = body.description != null ? body.description : '';
    return jsonOutput_(saveFileDescription_(sid, sdesc));
  }

  if (action === 'restore') {
    var rid2 = body.fileId || '';
    return jsonOutput_(restoreFileFromCompleted(rid2));
  }

  var fileId = body.fileId || (e.parameter && e.parameter.fileId) || '';
  return jsonOutput_(moveFileToCompleted(fileId));
}
