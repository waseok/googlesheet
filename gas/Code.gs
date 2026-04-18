/**
 * ============================================================================
 * 와석초 구글 시트 통합 관리 대시보드 (Wasok Sheet Hub) - Google Apps Script
 * ============================================================================
 * 역할:
 *   1) Drive에서 제목에 '[와석초]'가 포함된 스프레드시트를 검색해 JSON으로 반환
 *   2) 완료 처리 시 지정한 '완료 폴더'로 파일 이동 (스프레드시트만 허용)
 *
 * 스크립트 속성(프로젝트 설정 > 스크립트 속성):
 *   - COMPLETED_FOLDER_ID : 완료 이동 대상 폴더 ID (필수)
 *   - MUTATION_TOKEN      : 완료/이동 API용 비밀 문자열(필수). 쿼리 ?token= 또는 POST body
 *
 * 배포: [배포] > [새 배포] > 유형 웹 앱, 실행 사용자 본인, 액세스 권한은 학교 정책에 맞게.
 * 코드 변경 후에는 반드시 동일 배포에서 [새 버전]으로 재배포해야 반영됩니다.
 *
 * 한계(MVP): DriveApp 기준으로 실행 사용자가 접근 가능한 드라이브 범위에서만 검색됩니다.
 * 공유 드라이브(팀 드라이브) 전체 검색은 Advanced Drive API 등 별도 설정이 필요합니다.
 *
 * CORS: 외부 프런트에서 직접 호출 시 이슈가 있을 수 있으므로 Next.js API 프록시 사용을 권장합니다.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 기본값(스크립트 속성이 없을 때만 사용)
// ---------------------------------------------------------------------------
/** @type {string} 완료 폴더 ID — 비우면 COMPLETED_FOLDER_ID 스크립트 속성 필수 */
var DEFAULT_COMPLETED_FOLDER_ID = '';

/** 제목에 포함되는 키워드 */
var TITLE_KEYWORD = '[와석초]';

/** Google 스프레드시트 MIME (이동 API에서만 허용) */
var SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/**
 * 스크립트 속성: 완료 폴더 ID
 * @returns {string}
 */
function getCompletedFolderId_() {
  var id = PropertiesService.getScriptProperties().getProperty('COMPLETED_FOLDER_ID');
  if (id && id.length > 0) {
    return id;
  }
  return DEFAULT_COMPLETED_FOLDER_ID || '';
}

/**
 * 스크립트 속성: 완료/이동 요청용 토큰(비어 있으면 완료 API 거부)
 * @returns {string}
 */
function getMutationToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('MUTATION_TOKEN');
  return t && t.length > 0 ? t : '';
}

/**
 * 완료/이동 요청이 허용되는지 검사합니다.
 * @param {string} tokenFromRequest 쿼리 또는 POST body 의 token
 * @returns {{ ok: boolean, error?: string }}
 */
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
 * Drive 검색 쿼리 (스프레드시트만, 휴지통 제외)
 * @returns {string}
 */
function buildSearchQuery_() {
  return (
    "title contains '" +
    TITLE_KEYWORD.replace(/'/g, "\\'") +
    "' and mimeType = '" +
    SPREADSHEET_MIME +
    "' and trashed = false"
  );
}

/**
 * lastUpdated 기준 내림차순 정렬 (ISO 문자열 비교)
 * @param {Array<Object>} items
 * @returns {Array<Object>}
 */
function sortItemsByLastUpdatedDesc_(items) {
  return items.slice().sort(function (a, b) {
    if (a.lastUpdated < b.lastUpdated) return 1;
    if (a.lastUpdated > b.lastUpdated) return -1;
    return 0;
  });
}

/**
 * 검색 결과를 항목 배열로 변환
 * @param {GoogleAppsScript.Drive.FileIterator} iterator
 * @returns {Array<Object>}
 */
function mapFileIteratorToItems_(iterator) {
  var items = [];
  while (iterator.hasNext()) {
    var file = iterator.next();
    var ownerEmail = '';
    try {
      ownerEmail = file.getOwner().getEmail();
    } catch (err) {
      ownerEmail = '';
    }
    items.push({
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      owner: ownerEmail,
      lastUpdated: file.getLastUpdated().toISOString(),
    });
  }
  return items;
}

/**
 * '[와석초]' 스프레드시트 목록 (최신 수정순)
 * @returns {{ ok: boolean, items: Array<Object>, error?: string }}
 */
function listWasokSheets() {
  try {
    var query = buildSearchQuery_();
    var iterator = DriveApp.searchFiles(query);
    var items = sortItemsByLastUpdatedDesc_(mapFileIteratorToItems_(iterator));
    return { ok: true, items: items };
  } catch (e) {
    return { ok: false, items: [], error: String(e && e.message ? e.message : e) };
  }
}

/**
 * 파일을 완료 폴더로 이동 (스프레드시트 MIME 만)
 * @param {string} fileId
 * @returns {{ ok: boolean, message?: string, id?: string, error?: string }}
 */
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
    if (file.getMimeType() !== SPREADSHEET_MIME) {
      return { ok: false, error: '스프레드시트가 아닌 파일은 이동할 수 없습니다.' };
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
 * @param {Object} payload
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonOutput_(payload) {
  var out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

/**
 * GET
 *   목록: .../exec 또는 ?action=list
 *   완료: ?action=complete&fileId=...&token=MUTATION_TOKEN
 * @param {Object} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
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

/**
 * POST body: { "fileId": "...", "token": "MUTATION_TOKEN" }
 * @param {Object} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
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
