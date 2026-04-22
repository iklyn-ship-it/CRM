var FORM_ID = "1d-N0iiBLAAsKNblXoe0dT1FHtGJvzX7PpmqVqHCcKK0";

function doGet(e) {
  var callback = (e && e.parameter && e.parameter.callback) || "";
  var payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    items: readFormResponses_(e)
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

function readFormResponses_(e) {
  var formId = getFormId_(e);
  var form = FormApp.openById(formId);
  var items = form.getItems();
  var responses = form.getResponses();

  return responses.map(function(response) {
    var answers = mapAnswers_(response, items);
    return {
      responseId: response.getId(),
      submittedAt: normalizeDate_(response.getTimestamp()),
      clientName: pickValue_(answers, ["Имя клиента", "Клиент", "clientName"]),
      clientPhone: pickValue_(answers, ["Телефон", "Номер телефона", "clientPhone"]),
      clientSource: pickValue_(answers, ["Источник", "Источник клиента", "clientSource"]),
      clientNotes: pickValue_(answers, ["Комментарий клиента", "Заметка клиента", "clientNotes"]),
      equipmentName: pickValue_(answers, ["Техника", "Техника / код техники", "equipmentName"]),
      equipmentCode: pickValue_(answers, ["Код техники", "ID техники", "equipmentCode"]),
      operatorName: pickValue_(answers, ["Оператор", "operatorName"]),
      startDate: normalizeDate_(pickValue_(answers, ["Дата начала", "startDate"])),
      endDate: normalizeDate_(pickValue_(answers, ["Дата окончания", "endDate"])),
      location: pickValue_(answers, ["Локация", "Локация / объект", "Объект", "location"]),
      rate: normalizeNumber_(pickValue_(answers, ["Тариф", "Тариф грн/день", "rate"])),
      notes: pickValue_(answers, ["Комментарий", "notes"]),
      sourceLabel: "Google Form"
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
