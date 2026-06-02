import { Injectable, inject } from "@angular/core";
import { FinanceOperation, Order, Transport } from "../models/crm.models";
import { StateService } from "./state.service";
import { UtilsService } from "./utils.service";

export interface ProposalRow {
  title: string;
  details: string;
  amount: number;
  negative?: boolean;
}

export type CrmDocumentType =
  | "proposal"
  | "invoice"
  | "serviceAct"
  | "returnAct"
  | "orderReport"
  | "taxInvoiceNote";

export interface CommercialProposalDraft {
  documentType: CrmDocumentType;
  orderId: string;
  title: string;
  subtitle: string;
  client: string;
  location: string;
  period: string;
  equipment: string;
  operator: string;
  cargo: string;
  status: string;
  rows: ProposalRow[];
  costHeading: string;
  termsHeading: string;
  notes: string;
  terms: string[];
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

@Injectable({ providedIn: "root" })
export class CommercialProposalService {
  private state = inject(StateService);
  private utils = inject(UtilsService);
  private encoder = new TextEncoder();

  readonly documentTypes: { type: CrmDocumentType; label: string }[] = [
    { type: "proposal", label: "Комерційна пропозиція" },
    { type: "invoice", label: "Рахунок на оплату" },
    { type: "serviceAct", label: "Акт наданих послуг" },
    { type: "returnAct", label: "Акт повернення техніки" },
    { type: "orderReport", label: "Звіт по заявці" },
    { type: "taxInvoiceNote", label: "Податкова накладна" },
  ];

  createDraft(
    order: Order,
    documentType: CrmDocumentType = "proposal",
  ): CommercialProposalDraft {
    const base = this.baseDraft(order, documentType);
    if (documentType === "invoice") return this.invoiceDraft(order, base);
    if (documentType === "serviceAct") return this.serviceActDraft(order, base);
    if (documentType === "returnAct") return this.returnActDraft(order, base);
    if (documentType === "orderReport")
      return this.orderReportDraft(order, base);
    if (documentType === "taxInvoiceNote") {
      return this.taxInvoiceNoteDraft(order, base);
    }
    return this.proposalDraft(order, base);
  }

  createTransportInvoiceDraft(transport: Transport): CommercialProposalDraft {
    const paid = this.state.transportIncome(transport.id);
    const remaining = this.state.transportRemaining(transport);
    const total = this.state.transportTotal(transport);
    const route = `${transport.loadingPoint || "Пункт завантаження не вказано"} - ${transport.unloadingPoint || "пункт вивантаження не вказано"}`;
    const rows = this.transportCostRows(transport);
    if (!rows.length && total > 0) {
      rows.push({
        title: `Перевезення вантажу: ${transport.cargoName || "не вказано"}`,
        details: `Маршрут: ${route}`,
        amount: total,
      });
    }
    if (paid > 0) {
      rows.push({
        title: "Оплачено раніше",
        details: "Фактичні приходи по перевезенню в CRM",
        amount: Math.min(paid, total),
        negative: true,
      });
    }
    if (!rows.length && remaining > 0) {
      rows.push({
        title: `Перевезення вантажу: ${transport.cargoName || "не вказано"}`,
        details: `Маршрут: ${route}`,
        amount: remaining,
      });
    }

    return {
      documentType: "invoice",
      orderId: transport.id,
      title: "Рахунок на оплату",
      subtitle: `за перевезенням ${this.shortId(transport.id)} від ${this.todayUk()}`,
      client: this.transportPayerName(transport),
      location: route,
      period: `${this.date(transport.startDate)} - ${this.date(transport.endDate)}`,
      equipment: this.equipmentName(transport.equipmentId),
      operator: this.operatorName(transport.driverId) || "Водія не вказано",
      cargo: transport.cargoName || "Не вказано",
      status: this.transportStatusLabel(transport.status),
      costHeading: "До оплати за перевезення",
      termsHeading: "Примітки до рахунку",
      notes: transport.notes || "",
      rows,
      terms: [
        "Рахунок сформовано на підставі даних перевезення в CRM.",
        "Оплата здійснюється за реквізитами ТОВ «РБТ-ГРУП» згідно з погодженими сторонами умовами.",
        "Після оплати закриваючими документами є акт наданих послуг та інші документи за домовленістю сторін.",
      ],
    };
  }

  private baseDraft(
    order: Order,
    documentType: CrmDocumentType,
  ): CommercialProposalDraft {
    return {
      documentType,
      orderId: order.id,
      title: this.documentLabel(documentType),
      subtitle: `до заявки ${this.shortId(order.id)} від ${this.todayUk()}`,
      client: this.clientName(order.clientId),
      location: order.location || "Не вказано",
      period: `${this.date(order.startDate)} - ${this.date(order.endDate)}`,
      equipment: this.equipmentName(order.equipmentId),
      operator: this.operatorName(order.operatorId) || "Без оператора",
      cargo: "",
      status: this.statusLabel(order.status),
      rows: [],
      costHeading: "Розрахунок вартості",
      termsHeading: "Умови",
      notes: order.notes || "",
      terms: [],
    };
  }

  private proposalDraft(
    order: Order,
    draft: CommercialProposalDraft,
  ): CommercialProposalDraft {
    return {
      ...draft,
      title: "Комерційна пропозиція",
      costHeading: "Розрахунок вартості",
      termsHeading: "Умови пропозиції",
      rows: this.proposalRows(order),
      terms: [
        "Вартість сформована на підставі даних заявки в CRM.",
        "Фінальна сума може бути уточнена після погодження обсягу робіт, логістики та додаткових витрат.",
        "Оплата, строки та інші умови узгоджуються сторонами окремо.",
      ],
    };
  }

  private invoiceDraft(
    order: Order,
    draft: CommercialProposalDraft,
  ): CommercialProposalDraft {
    const paid = this.state.orderIncome(order.id);
    const remaining = this.state.orderRemaining(order);
    return {
      ...draft,
      title: "Рахунок на оплату",
      subtitle: `за заявкою ${this.shortId(order.id)} від ${this.todayUk()}`,
      costHeading: "До оплати",
      termsHeading: "Примітки до рахунку",
      rows:
        remaining > 0
          ? [
              {
                title: `Оренда та додаткові послуги за заявкою ${this.shortId(order.id)}`,
                details: `План ${this.money(this.state.orderPlan(order))}; оплачено ${this.money(paid)}`,
                amount: remaining,
              },
            ]
          : this.proposalRows(order),
      terms: [
        "Рахунок сформовано на підставі даних заявки в CRM.",
        "Оплата здійснюється згідно з погодженими сторонами умовами.",
        "Після оплати закриваючими документами є акт наданих послуг та акт повернення техніки.",
      ],
    };
  }

  private serviceActDraft(
    order: Order,
    draft: CommercialProposalDraft,
  ): CommercialProposalDraft {
    return {
      ...draft,
      title: "Акт наданих послуг",
      subtitle: `за заявкою ${this.shortId(order.id)} від ${this.todayUk()}`,
      costHeading: "Надані послуги",
      termsHeading: "Підтвердження",
      rows: this.proposalRows(order),
      terms: [
        "Послуги надані в повному обсязі згідно з даними заявки.",
        "Сторони підтверджують період роботи, техніку, локацію та вартість послуг.",
        "Зауваження щодо обсягу або якості послуг фіксуються окремо в коментарі до акта.",
      ],
    };
  }

  private returnActDraft(
    order: Order,
    draft: CommercialProposalDraft,
  ): CommercialProposalDraft {
    return {
      ...draft,
      title: "Акт повернення техніки з оренди",
      subtitle: `за заявкою ${this.shortId(order.id)} від ${this.todayUk()}`,
      costHeading: "Дані повернення",
      termsHeading: "Стан техніки",
      rows: [
        {
          title: `Повернення техніки: ${this.equipmentName(order.equipmentId)}`,
          details: `Період оренди: ${draft.period}; об'єкт: ${draft.location}`,
          amount: 0,
        },
        {
          title: "Стан техніки",
          details: "Повернена / потребує додаткового огляду",
          amount: 0,
        },
        {
          title: "Пошкодження / зауваження",
          details: order.breakdownEnabled
            ? order.breakdownDescription || "Зафіксована поломка"
            : "Не зафіксовано",
          amount: 0,
        },
      ],
      terms: [
        "Дата та час повернення підтверджуються сторонами під час підписання акта.",
        "Комплектність, рівень пального, мотогодини та пошкодження за потреби вносяться вручну перед друком.",
        "Після підписання акта техніка вважається поверненою з оренди.",
      ],
    };
  }

  private orderReportDraft(
    order: Order,
    draft: CommercialProposalDraft,
  ): CommercialProposalDraft {
    return {
      ...draft,
      title: "Звіт по заявці",
      subtitle: `заявка ${this.shortId(order.id)} від ${this.todayUk()}`,
      costHeading: "Фінансова деталізація",
      termsHeading: "Коментарі",
      rows: [
        {
          title: "План по заявці",
          details: "Оренда, логістика, додаткові послуги та витрати клієнта",
          amount: this.state.orderPlan(order),
        },
        {
          title: "Отримано оплат",
          details: "Фактичні приходи по заявці",
          amount: this.state.orderIncome(order.id),
        },
        {
          title: "Витрати",
          details: "Фактичні витрати та зарплата операторів",
          amount: this.state.orderExpense(order.id),
        },
        {
          title: "Залишок до оплати",
          details: "План мінус отримані платежі",
          amount: this.state.orderRemaining(order),
        },
        {
          title: "Прибуток",
          details: "Приходи мінус витрати",
          amount: this.state.orderProfit(order.id),
        },
      ],
      terms: [
        `Робочі дні техніки: ${this.state.orderEquipmentWorkDays(order)}.`,
        `Робочі години техніки: ${this.state.orderEquipmentWorkHours(order)}.`,
        `Робочі дні операторів: ${this.state.orderOperatorWorkDays(order)}.`,
      ],
    };
  }

  private taxInvoiceNoteDraft(
    order: Order,
    draft: CommercialProposalDraft,
  ): CommercialProposalDraft {
    return {
      ...draft,
      title: "Податкова накладна",
      subtitle: `нагадування по заявці ${this.shortId(order.id)} від ${this.todayUk()}`,
      costHeading: "Сума для контролю",
      termsHeading: "Нагадування",
      rows: [
        {
          title: "База для податкової накладної",
          details:
            "Сума за актом / рахунком, що підлягає перевірці бухгалтерією",
          amount: this.state.orderPlan(order),
        },
        {
          title: "ПДВ по техніці",
          details: order.vatEnabled
            ? "ПДВ увімкнено в заявці"
            : "ПДВ не увімкнено в заявці",
          amount: this.state.orderEquipmentVat(order),
        },
      ],
      terms: [
        "Цей документ є внутрішнім нагадуванням для підготовки/реєстрації податкової накладної.",
        "Офіційна податкова накладна формується та реєструється бухгалтерією в ЄРПН.",
        "Перед реєстрацією потрібно звірити суму, дату першої події та реквізити клієнта.",
      ],
    };
  }

  async downloadDraft(draft: CommercialProposalDraft): Promise<void> {
    const letterhead = await this.loadAsset("/assets/rbt-letterhead.png");
    const entries = this.buildDocxEntries(draft, letterhead);
    const zip = this.createZip(entries);
    const zipBuffer = zip.buffer.slice(
      zip.byteOffset,
      zip.byteOffset + zip.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([zipBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    this.downloadBlob(blob, this.fileName(draft));
  }

  createPdfPreviewHtml(draft: CommercialProposalDraft): string {
    return this.previewHtml(draft, false, false);
  }

  createPdfPreviewUrl(draft: CommercialProposalDraft): string {
    const blob = new Blob([this.createPdfPreviewHtml(draft)], {
      type: "text/html;charset=utf-8",
    });
    return URL.createObjectURL(blob);
  }

  total(draft: CommercialProposalDraft): number {
    return draft.rows.reduce(
      (sum, row) =>
        sum +
        (row.negative ? -Number(row.amount || 0) : Number(row.amount || 0)),
      0,
    );
  }

  private buildDocxEntries(
    draft: CommercialProposalDraft,
    letterhead: Uint8Array,
  ): ZipEntry[] {
    const hasLetterhead = letterhead.length > 0;
    const entries: ZipEntry[] = [
      this.textEntry("[Content_Types].xml", this.contentTypes(hasLetterhead)),
      this.textEntry("_rels/.rels", this.packageRels()),
      this.textEntry("word/document.xml", this.documentXml(draft)),
      this.textEntry("word/_rels/document.xml.rels", this.documentRels()),
      this.textEntry("word/styles.xml", this.stylesXml()),
      this.textEntry("word/settings.xml", this.settingsXml()),
      this.textEntry("word/numbering.xml", this.numberingXml()),
    ];

    if (hasLetterhead) {
      entries.push(
        this.textEntry("word/header1.xml", this.letterheadPartXml("header")),
        this.textEntry("word/footer1.xml", this.letterheadPartXml("footer")),
        this.textEntry("word/_rels/header1.xml.rels", this.imageRels()),
        this.textEntry("word/_rels/footer1.xml.rels", this.imageRels()),
        { name: "word/media/rbt-letterhead.png", data: letterhead },
      );
    } else {
      entries.push(
        this.textEntry("word/header1.xml", this.emptyHeaderFooterXml("hdr")),
        this.textEntry("word/footer1.xml", this.emptyHeaderFooterXml("ftr")),
      );
    }

    return entries;
  }

  private documentXml(draft: CommercialProposalDraft): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${this.paragraph(draft.title, "Title")}
    ${this.paragraph(draft.subtitle, "Subtitle")}
    ${this.infoTable([
      ["Клієнт", draft.client],
      ["Об'єкт / локація", draft.location],
      ["Період робіт", draft.period],
      ["Техніка", draft.equipment],
      ["Оператор", draft.operator],
      ...(draft.cargo ? ([["Вантаж", draft.cargo]] as [string, string][]) : []),
      ["Статус заявки", draft.status],
    ])}
    ${this.paragraph(draft.costHeading, "Heading1")}
    ${this.costTable(draft.rows, this.total(draft))}
    ${this.notesBlock(draft)}
    ${this.paragraph(draft.termsHeading, "Heading1")}
    ${draft.terms
      .filter(Boolean)
      .map((term) => this.bullet(term))
      .join("")}
    ${this.signatureBlock(draft)}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId3"/>
      <w:footerReference w:type="default" r:id="rId4"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="3000" w:right="1134" w:bottom="1700" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  private previewHtml(
    draft: CommercialProposalDraft,
    autoPrint = false,
    showToolbar = true,
  ): string {
    const rows = draft.rows
      .map(
        (row) => `<tr>
          <td><strong>${this.html(row.title)}</strong></td>
          <td>${this.html(row.details || "—")}</td>
          <td class="money">${row.negative ? "-" : ""}${this.html(this.money(row.amount))}</td>
        </tr>`,
      )
      .join("");
    const infoRows = [
      ["Клієнт", draft.client],
      ["Об'єкт / локація", draft.location],
      ["Період робіт", draft.period],
      ["Техніка", draft.equipment],
      ["Оператор", draft.operator],
      ...(draft.cargo ? ([["Вантаж", draft.cargo]] as [string, string][]) : []),
      ["Статус заявки", draft.status],
    ]
      .map(
        ([label, value]) => `<tr>
          <th>${this.html(label)}</th>
          <td>${this.html(value)}</td>
        </tr>`,
      )
      .join("");
    const terms = draft.terms
      .filter(Boolean)
      .map((term) => `<li>${this.html(term)}</li>`)
      .join("");
    const notes = draft.notes?.trim()
      ? `<section><h2>Коментар</h2><p>${this.html(draft.notes)}</p></section>`
      : "";

    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${this.html(draft.title)} ${this.html(this.shortId(draft.orderId))}</title>
  <style>
    :root {
      --blue: #0b2a5b;
      --text: #1f2937;
      --muted: #6b7280;
      --line: #d6e0ee;
      --soft: #eef5ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e5e7eb;
      color: var(--text);
      font-family: Arial, sans-serif;
      line-height: 1.35;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 12px;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(10px);
    }
    .toolbar button {
      border: 0;
      border-radius: 999px;
      padding: 10px 18px;
      background: #22c55e;
      color: #03110a;
      font-weight: 800;
      cursor: pointer;
    }
    .page {
      width: min(210mm, calc(100vw - 24px));
      min-height: 297mm;
      margin: 18px auto;
      padding: 24mm 14mm 18mm;
      background: #fff;
      box-shadow: 0 18px 60px rgba(15, 23, 42, 0.18);
    }
    header {
      display: grid;
      grid-template-columns: 1fr 1.35fr;
      gap: 24px;
      align-items: end;
      padding-bottom: 14px;
      border-bottom: 2px solid #cbd5e1;
      color: #9ca3af;
      font-weight: 700;
    }
    .logo {
      color: #b9c2d1;
      font-size: 54px;
      line-height: 0.8;
      letter-spacing: -7px;
      font-weight: 900;
    }
    .logo span {
      color: #d5e0f5;
    }
    .company-small {
      margin-top: 16px;
      font-size: 13px;
      letter-spacing: 0.02em;
    }
    .address {
      text-align: right;
      font-size: 13px;
    }
    h1 {
      margin: 34px 0 4px;
      color: var(--blue);
      text-align: center;
      font-size: 30px;
    }
    .subtitle {
      margin: 0 0 22px;
      text-align: center;
      color: #4b5563;
      font-size: 19px;
    }
    h2 {
      margin: 24px 0 10px;
      color: var(--blue);
      font-size: 22px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 7px 9px;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    .info th {
      width: 34%;
      background: #f2f6fc;
      text-align: left;
    }
    .cost th {
      background: var(--blue);
      color: #fff;
      text-align: left;
    }
    .cost th:nth-child(1), .cost td:nth-child(1) { width: 38%; }
    .cost th:nth-child(2), .cost td:nth-child(2) { width: 40%; }
    .cost th:nth-child(3), .cost td:nth-child(3) { width: 22%; }
    .money {
      text-align: right;
      white-space: nowrap;
      font-weight: 800;
    }
    .total-row td {
      background: var(--soft);
      font-weight: 900;
      color: #111827;
    }
    p {
      margin: 0 0 10px;
    }
    ul {
      margin: 0;
      padding-left: 22px;
      font-size: 17px;
    }
    footer {
      margin-top: 44px;
      padding-top: 14px;
      border-top: 2px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      color: #b8c0cc;
      font-weight: 800;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      margin-top: 34px;
      page-break-inside: avoid;
    }
    .signature-box {
      min-height: 92px;
      padding-top: 6px;
    }
    .signature-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .signature-name {
      font-weight: 800;
      min-height: 34px;
    }
    .signature-line {
      margin-top: 24px;
      border-top: 1px solid #1f2937;
      padding-top: 6px;
      color: var(--muted);
      font-size: 12px;
      text-align: center;
    }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 18mm 12mm 14mm;
        box-shadow: none;
      }
    }
    @media (max-width: 720px) {
      .page {
        width: 100%;
        margin: 0;
        padding: 18px;
        min-height: 100vh;
      }
      header {
        grid-template-columns: 1fr;
      }
      .address {
        text-align: left;
      }
      .cost th, .cost td {
        font-size: 12px;
        padding: 6px;
      }
      .money {
        white-space: normal;
      }
      .signature-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body${autoPrint ? ' onload="setTimeout(function(){ window.print(); }, 350)"' : ""}>
  ${
    showToolbar
      ? `<div class="toolbar">
    <button type="button" onclick="window.print()">Сохранить PDF / печать</button>
    <button type="button" onclick="window.close()">Закрыть</button>
  </div>`
      : ""
  }
  <main class="page">
    <header>
      <div>
        <div class="logo">R<span>B</span>T</div>
        <div class="company-small">ТОВ «РБТ-ГРУП»<br />код ЄДРПОУ 37360626</div>
      </div>
      <div class="address">
        Місцезнаходження: 08292, Київська обл.,<br />
        Бучанський р-н, м. Буча, вул. Тячівська, буд.1
      </div>
    </header>
    <h1>${this.html(draft.title)}</h1>
    <p class="subtitle">${this.html(draft.subtitle)}</p>
    <table class="info">${infoRows}</table>
    <section>
      <h2>${this.html(draft.costHeading)}</h2>
      <table class="cost">
        <thead>
          <tr><th>Послуга</th><th>Деталі</th><th>Сума</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="2" class="money">Разом до сплати</td>
            <td class="money">${this.html(this.money(this.total(draft)))}</td>
          </tr>
        </tbody>
      </table>
    </section>
    ${notes}
    <section>
      <h2>${this.html(draft.termsHeading)}</h2>
      <ul>${terms}</ul>
    </section>
    ${this.signatureBlockHtml(draft)}
    <footer>
      <span>trans@rbt-group.com.ua</span>
      <span>+38(068) 968 44 28</span>
    </footer>
  </main>
</body>
</html>`;
  }

  private proposalRows(order: Order): ProposalRow[] {
    const rows: ProposalRow[] = [];
    const workDays = this.state.orderEquipmentWorkDays(order);
    const workHours = this.state.orderEquipmentWorkHours(order);
    const hourlyRate = Number(order.equipmentHourlyRate || 0);
    const baseRental = this.state.orderEquipmentRentalPlan(order);
    const equipmentDetails = hourlyRate
      ? `${workHours} год. x ${this.money(hourlyRate)} / год.`
      : `${workDays} дн. x ${this.money(order.rate)} / день`;

    rows.push({
      title: `Оренда техніки: ${this.equipmentName(order.equipmentId)}`,
      details: equipmentDetails,
      amount: baseRental,
    });

    const vat = this.state.orderEquipmentVat(order);
    if (vat > 0) {
      rows.push({
        title: "ПДВ 20% до вартості техніки",
        details: "Нараховано відповідно до позначки в заявці",
        amount: vat,
      });
    }

    if (order.logisticsEnabled && this.state.orderLogisticsCost(order) > 0) {
      rows.push(...this.logisticsRows(order));
    }

    if (order.assemblyEnabled && this.state.orderAssemblyCost(order) > 0) {
      if (Number(order.assemblyDisassemblyCost || 0) > 0) {
        rows.push({
          title: "Демонтаж / розбірка техніки",
          details: this.date(order.assemblyDisassemblyDate),
          amount: Number(order.assemblyDisassemblyCost || 0),
        });
      }
      if (Number(order.assemblyAssemblyCost || 0) > 0) {
        rows.push({
          title: "Монтаж / збірка техніки",
          details: this.date(order.assemblyAssemblyDate),
          amount: Number(order.assemblyAssemblyCost || 0),
        });
      }
    }

    this.billableExpenses(order.id).forEach((operation) => {
      rows.push({
        title: `Додаткові витрати: ${operation.category}`,
        details: [
          operation.comment,
          operation.markup ? `Націнка: ${this.money(operation.markup)}` : "",
        ]
          .filter(Boolean)
          .join(" • "),
        amount: Number(operation.amount || 0) + Number(operation.markup || 0),
      });
    });

    const discount = this.state.orderDiscountAmount(order);
    if (discount > 0) {
      rows.push({
        title: "Знижка",
        details:
          order.discountType === "percent"
            ? `${Number(order.discountValue || 0)}%`
            : "Фіксована сума",
        amount: discount,
        negative: true,
      });
    }

    return rows;
  }

  private logisticsRows(order: Order): ProposalRow[] {
    const rows: ProposalRow[] = [];
    const outbound =
      Number(order.logisticsPickupCost || 0) +
      Number(order.logisticsDeliveryCost || 0);
    const inbound =
      Number(order.logisticsReturnPickupCost || 0) +
      Number(order.logisticsReturnDeliveryCost || 0);

    if (outbound > 0) {
      rows.push({
        title: "Логістика на об'єкт",
        details: [
          this.providerLabel(order.logisticsProvider),
          `${this.date(order.logisticsStartDate || order.startDate)} - ${this.date(order.logisticsEndDate || order.startDate)}`,
          this.logisticsDetails(
            order.logisticsPickupKm,
            order.logisticsPickupPricePerKm,
            order.logisticsDeliveryKm,
            order.logisticsDeliveryPricePerKm,
          ),
        ]
          .filter(Boolean)
          .join(" • "),
        amount: outbound,
      });
    }

    if (inbound > 0) {
      rows.push({
        title: "Логістика повернення на базу",
        details: [
          this.providerLabel(order.logisticsReturnProvider),
          `${this.date(order.logisticsReturnStartDate || order.endDate)} - ${this.date(order.logisticsReturnEndDate || order.endDate)}`,
          this.logisticsDetails(
            order.logisticsReturnPickupKm,
            order.logisticsReturnPickupPricePerKm,
            order.logisticsReturnDeliveryKm,
            order.logisticsReturnDeliveryPricePerKm,
          ),
        ]
          .filter(Boolean)
          .join(" • "),
        amount: inbound,
      });
    }

    if (!rows.length && Number(order.logisticsCost || 0) > 0) {
      rows.push({
        title: "Логістика",
        details: this.providerLabel(order.logisticsProvider),
        amount: Number(order.logisticsCost || 0),
      });
    }

    return rows;
  }

  private logisticsDetails(
    pickupKm: number,
    pickupPrice: number,
    deliveryKm: number,
    deliveryPrice: number,
  ): string {
    const parts = [];
    if (Number(pickupKm || 0) > 0) {
      parts.push(
        `подача ${pickupKm} км x ${this.money(Number(pickupPrice || 0))}`,
      );
    }
    if (Number(deliveryKm || 0) > 0) {
      parts.push(
        `доставка ${deliveryKm} км x ${this.money(Number(deliveryPrice || 0))}`,
      );
    }
    return parts.join("; ");
  }

  private billableExpenses(orderId: string): FinanceOperation[] {
    return this.state
      .orderOps(orderId)
      .filter(
        (operation) => operation.type === "expense" && operation.billClient,
      );
  }

  private transportCostRows(transport: Transport): ProposalRow[] {
    const rows: ProposalRow[] = [];
    const pickupCost = Number(transport.pickupCost || 0);
    const deliveryCost = Number(transport.deliveryCost || 0);

    if (pickupCost > 0) {
      rows.push({
        title: "Подача трала",
        details: `${Number(transport.pickupKm || 0)} км x ${this.money(Number(transport.pickupPricePerKm || 0))}`,
        amount: pickupCost,
      });
    }

    if (deliveryCost > 0) {
      rows.push({
        title: "Доставка вантажу",
        details: `${Number(transport.deliveryKm || 0)} км x ${this.money(Number(transport.deliveryPricePerKm || 0))}`,
        amount: deliveryCost,
      });
    }

    return rows;
  }

  private notesBlock(draft: CommercialProposalDraft): string {
    if (!draft.notes?.trim()) return "";
    return `${this.paragraph("Коментар до заявки", "Heading1")}
    ${this.paragraph(draft.notes, "Normal")}`;
  }

  private infoTable(rows: [string, string][]): string {
    const body = rows
      .map(
        ([label, value]) => `<w:tr>
          ${this.cell(label, "2460", true, "F2F6FC")}
          ${this.cell(value, "6800")}
        </w:tr>`,
      )
      .join("");

    return `<w:tbl>
      ${this.tableProps("9260")}
      <w:tblGrid><w:gridCol w:w="2460"/><w:gridCol w:w="6800"/></w:tblGrid>
      ${body}
    </w:tbl>`;
  }

  private costTable(rows: ProposalRow[], total: number): string {
    const vatRows = rows.filter((row) => row.title.startsWith("ПДВ 20%"));
    const calculationRows = rows.filter(
      (row) => !row.title.startsWith("ПДВ 20%"),
    );
    const vatTotal = vatRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const header = `<w:tr>
      ${this.cell("Послуга", "3700", true, "0B2A5B", "FFFFFF")}
      ${this.cell("Деталі", "3560", true, "0B2A5B", "FFFFFF")}
      ${this.cell("Сума", "2000", true, "0B2A5B", "FFFFFF", "right")}
    </w:tr>`;
    const body = calculationRows
      .map(
        (row) => `<w:tr>
          ${this.cell(row.title, "3700", true)}
          ${this.cell(row.details || "—", "3560")}
          ${this.cell(`${row.negative ? "-" : ""}${this.money(row.amount)}`, "2000", true, "", "", "right")}
        </w:tr>`,
      )
      .join("");
    const vatFooter =
      vatTotal > 0
        ? `<w:tr>
      ${this.cell("у тому числі ПДВ 20%", "7260", true, "F7FAFF", "", "right", 2)}
      ${this.cell(this.money(vatTotal), "2000", true, "F7FAFF", "", "right")}
    </w:tr>`
        : "";
    const footer = `<w:tr>
      ${this.cell("Разом до сплати", "7260", true, "EAF2FF", "", "right", 2)}
      ${this.cell(this.money(total), "2000", true, "EAF2FF", "", "right")}
    </w:tr>`;

    return `<w:tbl>
      ${this.tableProps("9260")}
      <w:tblGrid><w:gridCol w:w="3700"/><w:gridCol w:w="3560"/><w:gridCol w:w="2000"/></w:tblGrid>
      ${header}${body}${vatFooter}${footer}
    </w:tbl>`;
  }

  private cell(
    text: string,
    width: string,
    bold = false,
    fill = "",
    color = "",
    align: "left" | "right" | "center" = "left",
    gridSpan = 1,
  ): string {
    const shading = fill ? `<w:shd w:fill="${fill}"/>` : "";
    const span = gridSpan > 1 ? `<w:gridSpan w:val="${gridSpan}"/>` : "";
    return `<w:tc>
      <w:tcPr>
        <w:tcW w:w="${width}" w:type="dxa"/>
        <w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>
        ${span}
        ${shading}
      </w:tcPr>
      ${this.paragraph(text, "TableText", { bold, color, align })}
    </w:tc>`;
  }

  private tableProps(width: string): string {
    return `<w:tblPr>
      <w:tblW w:w="${width}" w:type="dxa"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblInd w:w="0" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="D6E0EE"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="D6E0EE"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="D6E0EE"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="D6E0EE"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5ECF5"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5ECF5"/>
      </w:tblBorders>
      <w:tblLook w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
    </w:tblPr>`;
  }

  private signatureBlock(draft: CommercialProposalDraft): string {
    if (!this.needsClientSignature(draft)) {
      return `<w:p><w:pPr><w:spacing w:before="360" w:after="80"/></w:pPr></w:p>
      ${this.paragraph("З повагою,", "Normal")}
      ${this.paragraph("ТОВ «РБТ-ГРУП»", "NormalBold")}`;
    }

    return `<w:p><w:pPr><w:spacing w:before="420" w:after="80"/></w:pPr></w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9630" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>
          <w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>
          <w:insideH w:val="nil"/><w:insideV w:val="nil"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid><w:gridCol w:w="4650"/><w:gridCol w:w="4650"/></w:tblGrid>
      <w:tr>
        ${this.signatureCell("Виконавець", "ТОВ «РБТ-ГРУП»", "підпис / печатка")}
        ${this.signatureCell("Замовник / клієнт", draft.client, "підпис клієнта")}
      </w:tr>
    </w:tbl>`;
  }

  private signatureCell(label: string, name: string, caption: string): string {
    return `<w:tc>
      <w:tcPr>
        <w:tcW w:w="4650" w:type="dxa"/>
        <w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="300" w:type="dxa"/></w:tcMar>
        <w:tcBorders>
          <w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>
        </w:tcBorders>
      </w:tcPr>
      ${this.paragraph(label, "TableText", { color: "6B7280" })}
      ${this.paragraph(name || "—", "NormalBold")}
      ${this.paragraph("____________________________", "Normal", { align: "center" })}
      ${this.paragraph(caption, "TableText", { color: "6B7280", align: "center" })}
    </w:tc>`;
  }

  private signatureBlockHtml(draft: CommercialProposalDraft): string {
    if (!this.needsClientSignature(draft)) {
      return `<section>
        <p style="margin-top: 34px;">З повагою,</p>
        <p><strong>ТОВ «РБТ-ГРУП»</strong></p>
      </section>`;
    }

    return `<section class="signature-grid">
      <div class="signature-box">
        <div class="signature-label">Виконавець</div>
        <div class="signature-name">ТОВ «РБТ-ГРУП»</div>
        <div class="signature-line">підпис / печатка</div>
      </div>
      <div class="signature-box">
        <div class="signature-label">Замовник / клієнт</div>
        <div class="signature-name">${this.html(draft.client || "—")}</div>
        <div class="signature-line">підпис клієнта</div>
      </div>
    </section>`;
  }

  private needsClientSignature(draft: CommercialProposalDraft): boolean {
    return (
      draft.documentType === "serviceAct" || draft.documentType === "returnAct"
    );
  }

  private paragraph(
    text: string,
    style = "Normal",
    options: {
      bold?: boolean;
      color?: string;
      align?: "left" | "right" | "center";
    } = {},
  ): string {
    const align =
      options.align && options.align !== "left"
        ? `<w:jc w:val="${options.align}"/>`
        : "";
    const color = options.color ? `<w:color w:val="${options.color}"/>` : "";
    const bold = options.bold ? "<w:b/>" : "";
    return `<w:p>
      <w:pPr><w:pStyle w:val="${style}"/>${align}</w:pPr>
      <w:r><w:rPr>${bold}${color}</w:rPr><w:t xml:space="preserve">${this.xml(text)}</w:t></w:r>
    </w:p>`;
  }

  private bullet(text: string): string {
    return `<w:p>
      <w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>${this.xml(text)}</w:t></w:r>
    </w:p>`;
  }

  private letterheadPartXml(kind: "header" | "footer"): string {
    const tag = kind === "header" ? "hdr" : "ftr";
    if (kind === "footer") return this.emptyHeaderFooterXml(tag);

    const pageWidth = "7562850";
    const pageHeight = "10692000";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:r>
      <w:drawing>
        <wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">
          <wp:simplePos x="0" y="0"/>
          <wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>
          <wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>
          <wp:extent cx="${pageWidth}" cy="${pageHeight}"/>
          <wp:effectExtent l="0" t="0" r="0" b="0"/>
          <wp:wrapNone/>
          <wp:docPr id="1" name="RBT letterhead"/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr><pic:cNvPr id="1" name="rbt-letterhead.png"/><pic:cNvPicPr/></pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rId1"/>
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="${pageWidth}" cy="${pageHeight}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:anchor>
      </w:drawing>
    </w:r>
  </w:p>
</w:${tag}>`;
  }

  private emptyHeaderFooterXml(tag: "hdr" | "ftr"): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:${tag}>`;
  }

  private contentTypes(hasImage: boolean): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasImage ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;
  }

  private packageRels(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  }

  private documentRels(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;
  }

  private imageRels(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/rbt-letterhead.png"/>
</Relationships>`;
  }

  private stylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  ${this.style("Normal", "Arial", 22, "1F2937", false, 120, 120)}
  ${this.style("NormalBold", "Arial", 22, "1F2937", true, 120, 120)}
  ${this.style("Title", "Arial", 34, "0B2A5B", true, 180, 80, "center")}
  ${this.style("Subtitle", "Arial", 20, "4B5563", false, 0, 300, "center")}
  ${this.style("Heading1", "Arial", 25, "0B2A5B", true, 300, 120)}
  ${this.style("TableText", "Arial", 20, "1F2937", false, 0, 0)}
</w:styles>`;
  }

  private style(
    id: string,
    font: string,
    size: number,
    color: string,
    bold: boolean,
    before: number,
    after: number,
    align: "left" | "center" = "left",
  ): string {
    const jc = align === "center" ? '<w:jc w:val="center"/>' : "";
    return `<w:style w:type="paragraph" w:styleId="${id}">
      <w:name w:val="${id}"/>
      <w:pPr><w:spacing w:before="${before}" w:after="${after}" w:line="276" w:lineRule="auto"/>${jc}</w:pPr>
      <w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${bold ? "<w:b/>" : ""}<w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr>
    </w:style>`;
  }

  private settingsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat/></w:settings>`;
  }

  private numberingXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="420" w:hanging="220"/></w:pPr>
      <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
  }

  private textEntry(name: string, text: string): ZipEntry {
    return { name, data: this.encoder.encode(text) };
  }

  private async loadAsset(path: string): Promise<Uint8Array> {
    try {
      const response = await fetch(path);
      if (!response.ok) return new Uint8Array();
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      return new Uint8Array();
    }
  }

  private createZip(entries: ZipEntry[]): Uint8Array {
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    entries.forEach((entry) => {
      const name = this.encoder.encode(entry.name);
      const crc = this.crc32(entry.data);
      const local = this.localHeader(name, crc, entry.data.length);
      chunks.push(local, name, entry.data);
      central.push(
        this.centralHeader(name, crc, entry.data.length, offset),
        name,
      );
      offset += local.length + name.length + entry.data.length;
    });

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = this.endRecord(entries.length, centralSize, offset);
    return this.concat([...chunks, ...central, end]);
  }

  private localHeader(name: Uint8Array, crc: number, size: number): Uint8Array {
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    this.writeDosDate(view, 10);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    return header;
  }

  private centralHeader(
    name: Uint8Array,
    crc: number,
    size: number,
    offset: number,
  ): Uint8Array {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    this.writeDosDate(view, 12);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, name.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    return header;
  }

  private endRecord(
    entriesCount: number,
    centralSize: number,
    centralOffset: number,
  ): Uint8Array {
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entriesCount, true);
    view.setUint16(10, entriesCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    return end;
  }

  private writeDosDate(view: DataView, offset: number): void {
    const date = new Date();
    const time =
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2);
    const day =
      ((date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate();
    view.setUint16(offset, time, true);
    view.setUint16(offset + 2, day, true);
  }

  private crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc = (crc >>> 8) ^ this.crcTable[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private readonly crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  private concat(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private clientName(id: string): string {
    return this.state.byId(this.state.clients(), id)?.name || "Новий клієнт";
  }

  private equipmentName(id: string): string {
    return this.state.byId(this.state.equipment(), id)?.name || "Не вказано";
  }

  private operatorName(id: string): string {
    return this.state.byId(this.state.operators(), id)?.name || "";
  }

  private providerLabel(provider: Order["logisticsProvider"]): string {
    if (provider === "own_trawl") return "наш трал";
    if (provider === "self_drive") return "своїм ходом";
    return "сторонній перевізник";
  }

  private transportPayerName(transport: Transport): string {
    return (
      this.state.byId(this.state.clients(), transport.consigneeClientId)
        ?.name ||
      this.state.byId(this.state.clients(), transport.shipperClientId)?.name ||
      transport.consignee ||
      transport.shipper ||
      "Новий клієнт"
    );
  }

  private statusLabel(status: Order["status"]): string {
    const labels: Record<Order["status"], string> = {
      new: "Нова",
      confirmed: "Підтверджена",
      active: "В роботі",
      completed: "Завершена",
      cancelled: "Скасована",
    };
    return labels[status];
  }

  private transportStatusLabel(status: Transport["status"]): string {
    const labels: Record<Transport["status"], string> = {
      new: "Нова",
      active: "В роботі",
      completed: "Завершена",
      cancelled: "Скасована",
    };
    return labels[status];
  }

  private documentLabel(type: CrmDocumentType): string {
    return (
      this.documentTypes.find((documentType) => documentType.type === type)
        ?.label || "Документ"
    );
  }

  private fileName(draft: CommercialProposalDraft): string {
    const client = draft.client
      .replace(/[\\/:*?"<>|]/g, "")
      .trim()
      .slice(0, 40);
    return `${this.documentLabel(draft.documentType)} ${this.shortId(draft.orderId)} ${client}.docx`;
  }

  private shortId(id: string): string {
    return this.utils.shortId(id);
  }

  private todayUk(): string {
    return new Date().toLocaleDateString("uk-UA");
  }

  private date(value: string): string {
    return this.utils.fmtDate(value);
  }

  private money(value: number): string {
    return this.utils.money(value);
  }

  private xml(value: string): string {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private html(value: string): string {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
