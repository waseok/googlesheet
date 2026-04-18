/**
 * ============================================================================
 * 와석초 구글 시트 통합 관리 대시보드 (Wasok Sheet Hub) - Google Apps Script
 * ============================================================================
 * 목록 규칙:
 *   - 제목에 대괄호 포함 문자열 "[와석초]" 가 정확히 들어간 스프레드시트만 (와석초 단독 제외)
 *   - 생성일(getDateCreated)이 LIST_YEAR 연도인 것만
 *   - 제목에 "취합"이 있으면 collectItems 로, 없으면 items 로 분리 반환
 *
 * 스크립트 속성:
 *   - COMPLETED_FOLDER_ID, MUTATION_TOKEN (기존과 동일)
 *   - LIST_YEAR (선택, 기본 2026) — 생성 연도 필터
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

/** 제목에 포함되면 "취합" 구역으로 분류 */
var COLLECT_MARK = '취합';

var SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

function getCompletedFolderId_() {
  var id = PropertiesService.getScriptProperties().getProperty('COMPLETED_FOLDER_ID');
  if (id && id.length > 0) {
    return id;
  }
  return DEFAULT_COMPLETED_FOLDER_ID || '';
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

function sortItemsByLastUpdatedDesc_(items) {
  return items.slice().sort(function (a, b) {
    if (a.lastUpdated < b.lastUpdated) return 1;
    if (a.lastUpdated > b.lastUpdated) return -1;
    return 0;
  });
}

/**
 * @param {GoogleAppsScript.Drive.File} file
 * @returns {Object}
 */
function fileToItem_(file) {
  var ownerEmail = '';
  try {
    ownerEmail = file.getOwner().getEmail();
  } catch (err) {
    ownerEmail = '';
  }
  return {
    id: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    owner: ownerEmail,
    lastUpdated: file.getLastUpdated().toISOString(),
    createdTime: file.getDateCreated().toISOString(),
  };
}

/**
 * @param {Array<Object>} items name 필드 기준
 * @returns {{ items: Array<Object>, collectItems: Array<Object> }}
 */
function partitionCollect_(items) {
  var general = [];
  var collect = [];
  for (var i = 0; i < items.length; i++) {
    var row = items[i];
    if (row.name.indexOf(COLLECT_MARK) !== -1) {
      collect.push(row);
    } else {
      general.push(row);
    }
  }
  return { items: general, collectItems: collect };
}

/**
 * @returns {{ ok: boolean, items: Array<Object>, collectItems: Array<Object>, error?: string }}
 */
function listWasokSheets() {
  try {
    var query = buildLooseSearchQuery_();
    var iterator = DriveApp.searchFiles(query);
    var passed = [];
    while (iterator.hasNext()) {
      var file = iterator.next();
      if (filePassesListRules_(file)) {
        passed.push(fileToItem_(file));
      }
    }
    var sorted = sortItemsByLastUpdatedDesc_(passed);
    var parts = partitionCollect_(sorted);
    parts.items = sortItemsByLastUpdatedDesc_(parts.items);
    parts.collectItems = sortItemsByLastUpdatedDesc_(parts.collectItems);
    return {
      ok: true,
      items: parts.items,
      collectItems: parts.collectItems,
    };
  } catch (e) {
    return {
      ok: false,
      items: [],
      collectItems: [],
      error: String(e && e.message ? e.message : e),
    };
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
  var fileId = body.fileId || (e.parameter && e.parameter.fileId) || '';
  return jsonOutput_(moveFileToCompleted(fileId));
}
