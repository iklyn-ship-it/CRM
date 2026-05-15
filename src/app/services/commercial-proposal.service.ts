import { Injectable, inject } from "@angular/core";
import { FinanceOperation, Order } from "../models/crm.models";
import { StateService } from "./state.service";
import { UtilsService } from "./utils.service";

interface ProposalRow {
  title: string;
  details: string;
  amount: number;
  negative?: boolean;
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

  async generateForOrder(order: Order): Promise<void> {
    const letterhead = await this.loadAsset("/assets/rbt-letterhead.png");
    const entries = this.buildDocxEntries(order, letterhead);
    const zip = this.createZip(entries);
    const zipBuffer = zip.buffer.slice(
      zip.byteOffset,
      zip.byteOffset + zip.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([zipBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    this.downloadBlob(blob, this.fileName(order));
  }

  private buildDocxEntries(order: Order, letterhead: Uint8Array): ZipEntry[] {
    const hasLetterhead = letterhead.length > 0;
    const entries: ZipEntry[] = [
      this.textEntry("[Content_Types].xml", this.contentTypes(hasLetterhead)),
      this.textEntry("_rels/.rels", this.packageRels()),
      this.textEntry("word/document.xml", this.documentXml(order)),
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

  private documentXml(order: Order): string {
    const client = this.clientName(order.clientId);
    const equipment = this.equipmentName(order.equipmentId);
    const operator = this.operatorName(order.operatorId);
    const rows = this.proposalRows(order);
    const total = rows.reduce(
      (sum, row) => sum + (row.negative ? -row.amount : row.amount),
      0,
    );

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${this.paragraph("Комерційна пропозиція", "Title")}
    ${this.paragraph(`до заявки ${this.shortId(order.id)} від ${this.todayUk()}`, "Subtitle")}
    ${this.infoTable([
      ["Клієнт", client],
      ["Об'єкт / локація", order.location || "Не вказано"],
      [
        "Період робіт",
        `${this.date(order.startDate)} - ${this.date(order.endDate)}`,
      ],
      ["Техніка", equipment],
      ["Оператор", operator || "Без оператора"],
      ["Статус заявки", this.statusLabel(order.status)],
    ])}
    ${this.paragraph("Розрахунок вартості", "Heading1")}
    ${this.costTable(rows, total)}
    ${this.notesBlock(order)}
    ${this.paragraph("Умови пропозиції", "Heading1")}
    ${this.bullet("Вартість сформована на підставі даних заявки в CRM.")}
    ${this.bullet("Фінальна сума може бути уточнена після погодження обсягу робіт, логістики та додаткових витрат.")}
    ${this.bullet("Оплата, строки та інші умови узгоджуються сторонами окремо.")}
    ${this.signatureBlock()}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId3"/>
      <w:footerReference w:type="default" r:id="rId4"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="2550" w:right="1134" w:bottom="1450" w:left="1134" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
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

  private notesBlock(order: Order): string {
    if (!order.notes?.trim()) return "";
    return `${this.paragraph("Коментар до заявки", "Heading1")}
    ${this.paragraph(order.notes, "Normal")}`;
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
    const header = `<w:tr>
      ${this.cell("Послуга", "3300", true, "0B2A5B", "FFFFFF")}
      ${this.cell("Деталі", "3830", true, "0B2A5B", "FFFFFF")}
      ${this.cell("Сума", "2130", true, "0B2A5B", "FFFFFF", "right")}
    </w:tr>`;
    const body = rows
      .map(
        (row) => `<w:tr>
          ${this.cell(row.title, "3300", true)}
          ${this.cell(row.details || "—", "3830")}
          ${this.cell(`${row.negative ? "-" : ""}${this.money(row.amount)}`, "2130", true, "", "", "right")}
        </w:tr>`,
      )
      .join("");
    const footer = `<w:tr>
      ${this.cell("Разом до сплати", "7130", true, "EAF2FF")}
      ${this.cell(this.money(total), "2130", true, "EAF2FF", "", "right")}
    </w:tr>`;

    return `<w:tbl>
      ${this.tableProps("9260")}
      <w:tblGrid><w:gridCol w:w="3300"/><w:gridCol w:w="3830"/><w:gridCol w:w="2130"/></w:tblGrid>
      ${header}${body}${footer}
    </w:tbl>`;
  }

  private cell(
    text: string,
    width: string,
    bold = false,
    fill = "",
    color = "",
    align: "left" | "right" | "center" = "left",
  ): string {
    const shading = fill ? `<w:shd w:fill="${fill}"/>` : "";
    return `<w:tc>
      <w:tcPr>
        <w:tcW w:w="${width}" w:type="dxa"/>
        <w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>
        ${shading}
      </w:tcPr>
      ${this.paragraph(text, "TableText", { bold, color, align })}
    </w:tc>`;
  }

  private tableProps(width: string): string {
    return `<w:tblPr>
      <w:tblW w:w="${width}" w:type="dxa"/>
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

  private signatureBlock(): string {
    return `<w:p><w:pPr><w:spacing w:before="360" w:after="80"/></w:pPr></w:p>
    ${this.paragraph("З повагою,", "Normal")}
    ${this.paragraph("ТОВ «РБТ-ГРУП»", "NormalBold")}`;
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
    const crop =
      kind === "header" ? '<a:srcRect b="74000"/>' : '<a:srcRect t="89000"/>';
    const cy = kind === "header" ? "1400000" : "420000";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:${tag} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="6100000" cy="${cy}"/>
          <wp:docPr id="1" name="RBT letterhead"/>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic>
                <pic:nvPicPr><pic:cNvPr id="1" name="rbt-letterhead.png"/><pic:cNvPicPr/></pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="rId1"/>
                  ${crop}
                  <a:stretch><a:fillRect/></a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="6100000" cy="${cy}"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
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

  private fileName(order: Order): string {
    const client = this.clientName(order.clientId)
      .replace(/[\\/:*?"<>|]/g, "")
      .trim()
      .slice(0, 40);
    return `Комерційна пропозиція ${this.shortId(order.id)} ${client}.docx`;
  }

  private shortId(id: string): string {
    return id.slice(-5);
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
}
