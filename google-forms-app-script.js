var FORM_ID = "1d-N0iiBLAAsKNblXoe0dT1FHtGJvzX7PpmqVqHCcKK0";
var SPREADSHEET_ID = "";
var SHEET_NAME = "";
var CRM_FORM_TITLE = "Заявка на аренду спецтехники";
var CRM_SPREADSHEET_TITLE = "CRM Form Responses";

function setupCrmGoogleForm() {
  var spreadsheet = SpreadsheetApp.create(CRM_SPREADSHEET_TITLE + " " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));
  var form = FormApp.create(CRM_FORM_TITLE);
  form.setDescription("Форма автоматически создана CRM-интеграцией. Новые ответы импортируются в CRM со статусом new (Новое).");

  form.addTextItem()
    .setTitle("Имя клиента")
    .setRequired(true);
  form.addTextItem()
    .setTitle("Телефон")
    .setRequired(true);
  form.addTextItem()
    .setTitle("Техника / код техники")
    .setRequired(true);
  form.addDateItem()
    .setTitle("Дата начала")
    .setRequired(true);
  form.addDateItem()
    .setTitle("Дата окончания")
    .setRequired(true);
  form.addTextItem()
    .setTitle("Локация / объект")
    .setRequired(true);
  form.addTextItem()
    .setTitle("Тариф грн/день")
    .setRequired(false);
  form.addParagraphTextItem()
    .setTitle("Комментарий")
    .setRequired(false);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  var responsesSheet = spreadsheet.getSheets()[0];
  PropertiesService.getScriptProperties().setProperties({
    FORM_ID: form.getId(),
    SPREADSHEET_ID: spreadsheet.getId(),
    SHEET_NAME: responsesSheet.getName()
  }, true);

  return {
    ok: true,
    formId: form.getId(),
    formEditUrl: form.getEditUrl(),
    formPublishedUrl: form.getPublishedUrl(),
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetName: responsesSheet.getName(),
    message: "Google Form и Google Sheet созданы и связаны. ID сохранены в Script Properties."
  };
}

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || "";
  var payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    items: readResponses_(e)
  };

  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readResponses_(e) {
  var spreadsheetId = getSpreadsheetId_(e);
  if (spreadsheetId) {
    return readSheetResponses_(e, spreadsheetId);
  }
  return readFormResponses_(e);
}

function readFormResponses_(e) {
  var formId = getFormId_(e);
  var form = FormApp.openById(formId);
  var items = form.getItems();
  var responses = form.getResponses();

  return responses.map(function(response) {
    var answers = mapAnswers_(response, items);
    var orderedAnswers = getOrderedAnswers_(response);
    return {
      responseId: response.getId(),
      submittedAt: normalizeDate_(response.getTimestamp()),
      clientName: fallbackValue_(pickValue_(answers, ["Имя клиента", "Клиент", "clientName"]), orderedAnswers[0]),
      clientPhone: fallbackValue_(pickValue_(answers, ["Телефон", "Номер телефона", "clientPhone"]), orderedAnswers[1]),
      clientSource: pickValue_(answers, ["Источник", "Источник клиента", "clientSource"]),
      clientNotes: pickValue_(answers, ["Комментарий клиента", "Заметка клиента", "clientNotes"]),
      equipmentName: fallbackValue_(pickValue_(answers, ["Техника", "Техника / код техники", "equipmentName"]), orderedAnswers[2]),
      equipmentCode: pickValue_(answers, ["Код техники", "ID техники", "equipmentCode"]),
      operatorName: pickValue_(answers, ["Оператор", "operatorName"]),
      startDate: normalizeDate_(fallbackValue_(pickValue_(answers, ["Дата начала", "startDate"]), orderedAnswers[3])),
      endDate: normalizeDate_(fallbackValue_(pickValue_(answers, ["Дата окончания", "endDate"]), orderedAnswers[4])),
      location: pickValue_(answers, ["Локация", "Локация / объект", "Объект", "location"]),
      rate: normalizeNumber_(pickValue_(answers, ["Тариф", "Тариф грн/день", "rate"])),
      notes: pickValue_(answers, ["Комментарий", "notes"]),
      sourceLabel: "Google Form"
    };
  }).filter(function(item) {
    return item.clientName && item.startDate && item.endDate;
  });
}

function readSheetResponses_(e, spreadsheetId) {
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = getResponsesSheet_(spreadsheet, e);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function(header) {
    return String(header || "").trim();
  });

  return values.slice(1).map(function(row, index) {
    var answers = mapRowByHeaders_(headers, row);
    return {
      responseId: buildSheetResponseId_(sheet, index + 2, answers),
      submittedAt: normalizeDate_(pickValue_(answers, ["Timestamp", "Отметка времени", "submittedAt"])),
      clientName: pickValue_(answers, ["Имя клиента", "Клиент", "clientName", "Відповідальна особа"]),
      clientPhone: pickValue_(answers, ["Телефон", "Номер телефона", "clientPhone", "Контактний номер телефону"]),
      clientSource: pickValue_(answers, ["Источник", "Источник клиента", "clientSource"]),
      clientNotes: pickValue_(answers, ["Комментарий клиента", "Заметка клиента", "clientNotes"]),
      equipmentName: pickValue_(answers, ["Техника", "Техника / код техники", "equipmentName", "Найменування спецтехніки"]),
      equipmentCode: pickValue_(answers, ["Код техники", "ID техники", "equipmentCode"]),
      operatorName: pickValue_(answers, ["Оператор", "operatorName"]),
      startDate: normalizeDate_(pickValue_(answers, ["Дата начала", "startDate", "Дата початку оренди"])),
      endDate: normalizeDate_(pickValue_(answers, ["Дата окончания", "endDate", "Дата кінця оренди"])),
      location: pickValue_(answers, ["Локация", "Локация / объект", "Объект", "location", "Місце розташування техніки"]),
      rate: normalizeNumber_(pickValue_(answers, ["Тариф", "Тариф грн/день", "rate", "Кількість годин"])),
      notes: pickValue_(answers, ["Комментарий", "notes"]),
      sourceLabel: "Google Form / Sheets"
    };
  }).filter(function(item) {
    return item.clientName && item.startDate && item.endDate;
  });
}

function getFormId_(e) {
  var queryFormId = e && e.parameter && e.parameter.formId;
  var scriptFormId = PropertiesService.getScriptProperties().getProperty("FORM_ID");
  return String(queryFormId || scriptFormId || FORM_ID || "").trim();
}

function getSpreadsheetId_(e) {
  var querySpreadsheetId = e && e.parameter && e.parameter.spreadsheetId;
  var scriptSpreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  return String(querySpreadsheetId || scriptSpreadsheetId || SPREADSHEET_ID || "").trim();
}

function getResponsesSheet_(spreadsheet, e) {
  var querySheetName = e && e.parameter && e.parameter.sheetName;
  var scriptSheetName = PropertiesService.getScriptProperties().getProperty("SHEET_NAME");
  var requestedName = String(querySheetName || scriptSheetName || SHEET_NAME || "").trim();
  if (requestedName) {
    var namedSheet = spreadsheet.getSheetByName(requestedName);
    if (namedSheet) return namedSheet;
  }
  return spreadsheet.getSheets()[0];
}

function mapAnswers_(response, formItems) {
  var byId = {};
  formItems.forEach(function(item) {
    byId[item.getId()] = item;
  });

  return response.getItemResponses().reduce(function(result, itemResponse) {
    var item = byId[itemResponse.getItem().getId()];
    var title = item ? String(item.getTitle() || "").trim() : "";
    if (!title) return result;
    result[title] = itemResponse.getResponse();
    return result;
  }, {});
}

function mapRowByHeaders_(headers, row) {
  return headers.reduce(function(result, header, index) {
    if (!header) return result;
    result[header] = row[index];
    return result;
  }, {});
}

function getOrderedAnswers_(response) {
  return response.getItemResponses().map(function(itemResponse) {
    return itemResponse.getResponse();
  });
}

function buildSheetResponseId_(sheet, rowNumber, answers) {
  var timestamp = pickValue_(answers, ["Timestamp", "Отметка времени", "submittedAt"]);
  return sheet.getSheetId() + ":" + rowNumber + ":" + String(timestamp || "").trim();
}

function pickValue_(answers, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    var value = answers[keys[i]];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      return value.join(", ").trim();
    }
    var text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function fallbackValue_(primary, fallback) {
  var primaryText = String(primary || "").trim();
  if (primaryText) return primaryText;
  if (fallback === undefined || fallback === null) return "";
  if (Array.isArray(fallback)) return fallback.join(", ").trim();
  return String(fallback).trim();
}

function normalizeNumber_(value) {
  var text = String(value || "").replace(",", ".").replace(/[^\d.-]/g, "").trim();
  return text ? Number(text) || 0 : 0;
}

function normalizeDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var text = String(value).trim();
  if (!text) return "";
  var parsed = new Date(text);
  if (!isNaN(parsed)) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return text;
}
