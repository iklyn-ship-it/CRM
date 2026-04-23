import { Injectable, inject } from "@angular/core";
import { DbService } from "./db.service";
import { UtilsService } from "./utils.service";

@Injectable({ providedIn: "root" })
export class DemoService {
  private db = inject(DbService);
  private utils = inject(UtilsService);

  async seed(): Promise<void> {
    if (this.db.clients().length || this.db.orders().length) {
      if (!confirm("Демо-данные добавятся к текущим. Продолжить?")) return;
    }

    const base = new Date();
    const d = (n: number) => this.utils.dateOffset(base, n);

    const c1 = await this.db.insert("clients", {
      id: this.utils.uid("cl"),
      name: "ТОВ Будмонтаж",
      phone: "+380671112233",
      source: "Сайт",
      type: "Постоянный",
      notes: "Часто арендует экскаватор",
    });
    const c2 = await this.db.insert("clients", {
      id: this.utils.uid("cl"),
      name: "ФОП Коваленко",
      phone: "+380501234567",
      source: "OLX",
      type: "Разовый",
      notes: "Объекты по Киевской области",
    });
    const c3 = await this.db.insert("clients", {
      id: this.utils.uid("cl"),
      name: "RDS Construction",
      phone: "+380931234567",
      source: "Рекомендация",
      type: "Постоянный",
      notes: "Работают по безналу",
    });

    const e1 = await this.db.insert("equipment", {
      id: this.utils.uid("eq"),
      name: "CAT 320",
      type: "Экскаватор",
      code: "EX-001",
      defaultRate: 18000,
      status: "free",
    });
    const e2 = await this.db.insert("equipment", {
      id: this.utils.uid("eq"),
      name: "XCMG QY25K",
      type: "Автокран",
      code: "CR-002",
      defaultRate: 26000,
      status: "free",
    });
    const e3 = await this.db.insert("equipment", {
      id: this.utils.uid("eq"),
      name: "MAN TGS",
      type: "Самосвал",
      code: "TR-003",
      defaultRate: 15000,
      status: "free",
    });

    const o1 = await this.db.insert("operators", {
      id: this.utils.uid("op"),
      name: "Иван Петренко",
      phone: "+380671234567",
      skill: "Экскаваторщик",
      rate: 2500,
    });
    const o2 = await this.db.insert("operators", {
      id: this.utils.uid("op"),
      name: "Сергей Бойко",
      phone: "+380501998877",
      skill: "Крановщик",
      rate: 3000,
    });

    const ord1 = await this.db.insert("orders", {
      id: this.utils.uid("ord"),
      clientId: c1.id,
      equipmentId: e1.id,
      operatorId: o1.id,
      startDate: d(-3),
      endDate: d(2),
      location: "Киевская обл.",
      rate: 18000,
      status: "active",
      notes: "Котлован",
    });
    const ord2 = await this.db.insert("orders", {
      id: this.utils.uid("ord"),
      clientId: c2.id,
      equipmentId: e2.id,
      operatorId: o2.id,
      startDate: d(4),
      endDate: d(6),
      location: "Бровары",
      rate: 26000,
      status: "confirmed",
      notes: "Монтаж плит",
    });
    await this.db.insert("orders", {
      id: this.utils.uid("ord"),
      clientId: c3.id,
      equipmentId: e3.id,
      operatorId: "",
      startDate: d(1),
      endDate: d(4),
      location: "Вишнёвое",
      rate: 15000,
      status: "new",
      notes: "Вывоз грунта",
    });
    await this.db.insert("orders", {
      id: this.utils.uid("ord"),
      clientId: c1.id,
      equipmentId: e1.id,
      operatorId: o1.id,
      startDate: d(1),
      endDate: d(5),
      location: "Ирпень",
      rate: 18000,
      status: "confirmed",
      notes: "Конфликтный пример",
    });

    const rep1 = await this.db.insert("repairs", {
      id: this.utils.uid("rep"),
      equipmentId: e2.id,
      startDate: d(5),
      endDate: d(7),
      status: "planned",
      tasks: "Замена троса и проверка стрелы",
      notes: "Нужны запчасти",
    });
    const rep2 = await this.db.insert("repairs", {
      id: this.utils.uid("rep"),
      equipmentId: e3.id,
      startDate: d(-1),
      endDate: d(1),
      status: "active",
      tasks: "ТО и замена масла",
      notes: "Сервис по месту",
    });

    await this.db.insert("operations", {
      id: this.utils.uid("fin"),
      date: d(-2),
      type: "income",
      category: "Оплата клиента",
      amount: 50000,
      orderId: ord1.id,
      repairId: "",
      comment: "Аванс",
    });
    await this.db.insert("operations", {
      id: this.utils.uid("fin"),
      date: d(-1),
      type: "expense",
      category: "Топливо",
      amount: 7000,
      orderId: ord1.id,
      repairId: "",
      comment: "Заправка",
    });
    await this.db.insert("operations", {
      id: this.utils.uid("fin"),
      date: d(-1),
      type: "expense",
      category: "Зарплата оператора",
      amount: 10000,
      orderId: ord1.id,
      repairId: "",
      comment: "Частичная выплата",
    });
    await this.db.insert("operations", {
      id: this.utils.uid("fin"),
      date: d(0),
      type: "income",
      category: "Оплата клиента",
      amount: 30000,
      orderId: ord2.id,
      repairId: "",
      comment: "Предоплата",
    });
    await this.db.insert("operations", {
      id: this.utils.uid("fin"),
      date: d(1),
      type: "expense",
      category: "Логистика",
      amount: 6000,
      orderId: ord2.id,
      repairId: "",
      comment: "Доставка крана",
    });
    await this.db.insert("operations", {
      id: this.utils.uid("fin"),
      date: d(5),
      type: "expense",
      category: "Запчасти",
      amount: 12000,
      orderId: "",
      repairId: rep1.id,
      comment: "Трос и расходники",
    });
    await this.db.insert("operations", {
      id: this.utils.uid("fin"),
      date: d(0),
      type: "expense",
      category: "Ремонт",
      amount: 4500,
      orderId: "",
      repairId: rep2.id,
      comment: "Сервисные работы",
    });
  }
}
