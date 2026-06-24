-- Manual PostgreSQL schema and seed script for the TableBDR backend.
-- Run this file only if the required tables do not already exist in the database.
-- Note: this script assumes referenced tables such as GN_contractor, GN_dogovor and GN_bdr already exist.

CREATE TABLE IF NOT EXISTS "GN_department" (
  "GN_Dep_id" SERIAL NOT NULL UNIQUE,
  "GN_department" TEXT NOT NULL,
  PRIMARY KEY("GN_Dep_id")
);

COMMENT ON TABLE "GN_department" IS 'Подразделения Общества';

CREATE TABLE IF NOT EXISTS "GN_budget_network_item" (
  "GN_b_id" SERIAL NOT NULL UNIQUE,
  "GN_budget_network_item" TEXT NOT NULL,
  PRIMARY KEY("GN_b_id")
);

COMMENT ON TABLE "GN_budget_network_item" IS 'Статьи бюджета Общества';

CREATE TABLE IF NOT EXISTS "PAO__budget_network_item" (
  "PAO_b_id" SERIAL NOT NULL UNIQUE,
  "PAO__budget_network_item" TEXT NOT NULL,
  PRIMARY KEY("PAO_b_id")
);

COMMENT ON TABLE "PAO__budget_network_item" IS 'Статьи бюджета Управления связи';

CREATE TABLE IF NOT EXISTS "GN_contractor" (
  "GN_c_id" SERIAL NOT NULL UNIQUE,
  "GN_contarctor" TEXT NOT NULL,
  PRIMARY KEY("GN_c_id")
);

COMMENT ON TABLE "GN_contractor" IS 'Контрагенты';

CREATE TABLE IF NOT EXISTS "GN_dogovor" (
  "GN_dgv_id" SERIAL NOT NULL UNIQUE,
  "GN_dogovor" TEXT NOT NULL,
  "GN_contarctor_FK" INTEGER NOT NULL,
  PRIMARY KEY("GN_dgv_id")
);

CREATE TABLE IF NOT EXISTS "GN_departament_object" (
  "GN_do_id" SERIAL NOT NULL UNIQUE,
  "GN_departament_object" TEXT NOT NULL,
  "GN_department_FK" INTEGER NOT NULL,
  PRIMARY KEY("GN_do_id")
);

COMMENT ON TABLE "GN_departament_object" IS 'Объекты Общества';

CREATE TABLE IF NOT EXISTS "GN_invest_okdp_tko_is_prit" (
  "GN_invest_okdp_tko_is_prit_id" SERIAL NOT NULL UNIQUE,
  "GN_invest_okdp_tko_is_prit" TEXT NOT NULL,
  PRIMARY KEY("GN_invest_okdp_tko_is_prit_id")
);

COMMENT ON TABLE "GN_invest_okdp_tko_is_prit" IS 'ОКДП ТКО для ИС ПРИТ';

CREATE TABLE IF NOT EXISTS "GN_invest_ogruz_rekvizit" (
  "GN_invest_ogruz_rekvizit_id" SERIAL NOT NULL UNIQUE,
  "GN_invest_ogruz_rekvizit" TEXT NOT NULL,
  PRIMARY KEY("GN_invest_ogruz_rekvizit_id")
);

COMMENT ON TABLE "GN_invest_ogruz_rekvizit" IS 'Огрузочный реквизит';

CREATE TABLE IF NOT EXISTS "GN_equipment_manufacturer" (
  "GN_equipment_manufacturer_id" SERIAL NOT NULL UNIQUE,
  "GN_equipment_manufacturer" TEXT NOT NULL,
  PRIMARY KEY("GN_equipment_manufacturer_id")
);

COMMENT ON TABLE "GN_equipment_manufacturer" IS 'Справочник производителей оборудования';

CREATE TABLE IF NOT EXISTS "GN_equipment_type" (
  "GN_equipment_type_id" SERIAL NOT NULL UNIQUE,
  "GN_equipment_type" TEXT NOT NULL,
  PRIMARY KEY("GN_equipment_type_id")
);

COMMENT ON TABLE "GN_equipment_type" IS 'Справочник типов оборудования';

CREATE TABLE IF NOT EXISTS "GN_equipment_model" (
  "GN_equipment_model_id" SERIAL NOT NULL UNIQUE,
  "GN_equipment_model" TEXT NOT NULL,
  "GN_equipment_manufacturer_FK" INTEGER NOT NULL REFERENCES "GN_equipment_manufacturer"("GN_equipment_manufacturer_id") ON DELETE NO ACTION,
  "GN_equipment_type_FK" INTEGER NOT NULL REFERENCES "GN_equipment_type"("GN_equipment_type_id") ON DELETE NO ACTION,
  PRIMARY KEY("GN_equipment_model_id")
);

COMMENT ON TABLE "GN_equipment_model" IS 'Справочник моделей оборудования';

CREATE TABLE IF NOT EXISTS "GN_equipment_purchase" (
  "GN_equipment_purchase_id" SERIAL NOT NULL UNIQUE,
  "GN_equipment_model_FK" INTEGER NOT NULL REFERENCES "GN_equipment_model"("GN_equipment_model_id") ON DELETE NO ACTION,
  "GN_department_FK" INTEGER NOT NULL REFERENCES "GN_department"("GN_Dep_id") ON DELETE NO ACTION,
  "GN_budget_network_item_FK" INTEGER NOT NULL REFERENCES "GN_budget_network_item"("GN_b_id") ON DELETE NO ACTION,
  "GN_departament_object_FK" INTEGER NOT NULL REFERENCES "GN_departament_object"("GN_do_id") ON DELETE NO ACTION,
  "GN_purchase_status" TEXT NOT NULL DEFAULT 'готово к закупке',
  "GN_purchase_quantity" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY("GN_equipment_purchase_id")
);

COMMENT ON TABLE "GN_equipment_purchase" IS 'Закупки оборудования по подразделениям и объектам';

CREATE TABLE IF NOT EXISTS "GN_contracts" (
  "GN_contract_id" SERIAL NOT NULL UNIQUE,
  "GN_contract_contractor_FK" INTEGER NOT NULL REFERENCES "GN_contractor"("GN_c_id") ON DELETE NO ACTION,
  "GN_contract_dogovor_FK" INTEGER NOT NULL REFERENCES "GN_dogovor"("GN_dgv_id") ON DELETE NO ACTION,
  "GN_contract_sed_launch_date" DATE NOT NULL,
  "GN_contract_asez_load_date" DATE NOT NULL,
  "GN_contract_state" TEXT NOT NULL,
  "GN_contract_status_updated_at" DATE NOT NULL,
  "GN_contract_approval_status" TEXT NOT NULL DEFAULT 'действующий',
  PRIMARY KEY("GN_contract_id")
);

COMMENT ON TABLE "GN_contracts" IS 'Договора';

CREATE TABLE IF NOT EXISTS "GN_invest_program" (
  "GN_invest_program_id" SERIAL NOT NULL UNIQUE,
  "GN_invest_pf_npf" TEXT NOT NULL,
  "GN_invest_name" TEXT NOT NULL,
  "GN_invest_quantity" INTEGER NOT NULL,
  "GN_invest_okdp_fk" INTEGER REFERENCES "GN_invest_okdp_tko_is_prit"("GN_invest_okdp_tko_is_prit_id") ON DELETE SET NULL,
  "GN_invest_supplier_fk" INTEGER REFERENCES "GN_contractor"("GN_c_id") ON DELETE SET NULL,
  "GN_invest_ogruz_fk" INTEGER REFERENCES "GN_invest_ogruz_rekvizit"("GN_invest_ogruz_rekvizit_id") ON DELETE SET NULL,
  "GN_invest_status" TEXT NOT NULL,
  "GN_invest_payment" TEXT NOT NULL,
  "GN_invest_in_budget" TEXT NOT NULL,
  "GN_invest_peo_code" TEXT NOT NULL,
  "GN_invest_mtr_code" TEXT NOT NULL,
  "GN_invest_pzp" TEXT NOT NULL,
  "GN_invest_agent_report" TEXT NOT NULL,
  "GN_invest_ap" TEXT NOT NULL,
  "GN_invest_spec" TEXT NOT NULL,
  "GN_invest_commissioning" TEXT NOT NULL,
  "GN_invest_it_accounting" TEXT NOT NULL,
  "GN_invest_sed_spec" TEXT NOT NULL,
  "GN_invest_sed_agent_report" TEXT NOT NULL,
  "GN_invest_state" TEXT NOT NULL,
  "GN_invest_real_price_no_vat_per_unit" NUMERIC(15,2) NOT NULL,
  "GN_invest_real_sum_no_vat_plus_agent_no_vat" NUMERIC(15,2) NOT NULL,
  "GN_invest_sum_no_vat" NUMERIC(15,2) NOT NULL,
  PRIMARY KEY("GN_invest_program_id")
);

CREATE TABLE IF NOT EXISTS "GN_contract_additional_agreements" (
  "GN_additional_agreement_id" SERIAL NOT NULL UNIQUE,
  "GN_contract_id_FK" INTEGER NOT NULL REFERENCES "GN_contracts"("GN_contract_id") ON DELETE CASCADE,
  "GN_additional_agreement_number" TEXT NOT NULL,
  "GN_additional_agreement_date" DATE NOT NULL,
  "GN_additional_agreement_description" TEXT NOT NULL,
  "GN_additional_agreement_amount" NUMERIC(15,2) NOT NULL,
  "GN_additional_agreement_status" TEXT NOT NULL DEFAULT 'действующий',
  PRIMARY KEY("GN_additional_agreement_id")
);

CREATE TABLE IF NOT EXISTS "GN_bdr" (
  "GN_bdr_ID" SERIAL NOT NULL UNIQUE,
  "PAO_budget_network_item_FK" INTEGER NOT NULL,
  "GN_department_FK" INTEGER NOT NULL,
  "GN_departament_object_FK" INTEGER NOT NULL,
  "GN_dogovor_FK" INTEGER NOT NULL,
  "GN_contracor_FK" INTEGER NOT NULL,
  "GN_budget_network_item_FK" INTEGER NOT NULL,
  "GN_bdr_predmet_dogovora" TEXT NOT NULL,
  "GN_bdr_ed.izm" TEXT NOT NULL,
  "GN_bdr_kol-vo" NUMERIC NOT NULL,
  "GN_bdr_limit" NUMERIC NOT NULL,
  "GN_bdr_edin.limit" NUMERIC NOT NULL,
  "GN_bdr_comments" TEXT NOT NULL,
  PRIMARY KEY("GN_bdr_ID")
);

CREATE TABLE IF NOT EXISTS "GN_bdr_limit_calculation" (
  "GN_bdr_limit_calc_id" SERIAL PRIMARY KEY,
  "GN_bdr_ID_FK" INTEGER NOT NULL REFERENCES "GN_bdr"("GN_bdr_ID") ON DELETE CASCADE,
  "line_order" INTEGER NOT NULL,
  "quantity" NUMERIC NOT NULL DEFAULT 0,
  "tariff" NUMERIC NOT NULL DEFAULT 0,
  "line_note" TEXT NOT NULL DEFAULT '',
  UNIQUE ("GN_bdr_ID_FK", "line_order")
);

CREATE TABLE IF NOT EXISTS "GN_bdr_monthly_forecast" (
  "GN_bdr_monthly_forecast_id" SERIAL PRIMARY KEY,
  "budget_item" TEXT NOT NULL,
  "contractor" TEXT NOT NULL,
  "dogovor" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "GN_bdr_ID_FK" INTEGER,
  "month_index" SMALLINT NOT NULL CHECK ("month_index" BETWEEN 0 AND 11),
  "month_value" NUMERIC NOT NULL DEFAULT 0,
  "month_fact_value" NUMERIC NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("budget_item", "contractor", "dogovor", "department", "month_index")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GN_bdr_monthly_forecast_row_month_uniq"
  ON "GN_bdr_monthly_forecast" ("GN_bdr_ID_FK", "month_index")
  WHERE "GN_bdr_ID_FK" IS NOT NULL;

ALTER TABLE "GN_dogovor"
  ADD FOREIGN KEY("GN_contarctor_FK") REFERENCES "GN_contractor"("GN_c_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE "GN_departament_object"
  ADD FOREIGN KEY("GN_department_FK") REFERENCES "GN_department"("GN_Dep_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE "GN_bdr"
  ADD FOREIGN KEY("PAO_budget_network_item_FK") REFERENCES "PAO__budget_network_item"("PAO_b_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_bdr"
  ADD FOREIGN KEY("GN_department_FK") REFERENCES "GN_department"("GN_Dep_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_bdr"
  ADD FOREIGN KEY("GN_departament_object_FK") REFERENCES "GN_departament_object"("GN_do_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_bdr"
  ADD FOREIGN KEY("GN_dogovor_FK") REFERENCES "GN_dogovor"("GN_dgv_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_bdr"
  ADD FOREIGN KEY("GN_contracor_FK") REFERENCES "GN_contractor"("GN_c_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_bdr"
  ADD FOREIGN KEY("GN_budget_network_item_FK") REFERENCES "GN_budget_network_item"("GN_b_id")
  ON UPDATE NO ACTION ON DELETE NO ACTION;

-- Seed data for GN_department tables
INSERT INTO "GN_department" ("GN_department") VALUES
  ('Отдел информационных технологий'),
  ('Отдел связи'),
  ('Бухгалтерия'),
  ('Административный отдел'),
  ('Технический отдел');

INSERT INTO "GN_budget_network_item" ("GN_budget_network_item") VALUES
  ('Интернет-услуги'),
  ('Телефония'),
  ('Мобильная связь'),
  ('Сетевое оборудование'),
  ('Программное обеспечение и лицензии');

INSERT INTO "PAO__budget_network_item" ("PAO__budget_network_item") VALUES
  ('Аренда каналов связи'),
  ('Техническое обслуживание'),
  ('Модернизация сети'),
  ('Резервирование каналов'),
  ('Консалтинг и поддержка');

INSERT INTO "GN_contractor" ("GN_contarctor") VALUES
  ('МегаФон'),
  ('Ростелеком'),
  ('Билайн'),
  ('Tele2'),
  ('ТТК');

INSERT INTO "GN_dogovor" ("GN_dogovor", "GN_contarctor_FK") VALUES
  ('Договор №001/2024 — Интернет и связь',  1),
  ('Договор №002/2024 — Фиксированная связь', 2),
  ('Договор №003/2024 — Корпоративная мобильная связь', 3),
  ('Договор №004/2024 — SIM-карты сотрудников', 4),
  ('Договор №005/2024 — Широкополосный доступ', 5);

INSERT INTO "GN_departament_object" ("GN_departament_object", "GN_department_FK") VALUES
  ('Главный офис',       1),
  ('Серверная комната',  2),
  ('Офис филиала №2',    4),
  ('Склад оборудования', 5),
  ('Переговорная зона',  3);

-- Reference data for GN_invest_okdp_tko_is_prit
INSERT INTO "GN_invest_okdp_tko_is_prit" ("GN_invest_okdp_tko_is_prit") VALUES
  ('3531100000000'),
  ('3531200000000'),
  ('3531300000000'),
  ('3531400000000'),
  ('3531500000000');

-- Reference data for GN_invest_ogruz_rekvizit
INSERT INTO "GN_invest_ogruz_rekvizit" ("GN_invest_ogruz_rekvizit") VALUES
  ('Реквизит А'),
  ('Реквизит Б'),
  ('Реквизит В'),
  ('Реквизит Г'),
  ('Реквизит Д');

INSERT INTO "GN_equipment_manufacturer" ("GN_equipment_manufacturer") VALUES
  ('Cisco'),
  ('HP'),
  ('Huawei'),
  ('Yealink'),
  ('Ubiquiti');

INSERT INTO "GN_equipment_type" ("GN_equipment_type") VALUES
  ('Коммутаторы'),
  ('Телефоны'),
  ('Маршрутизаторы'),
  ('Точки доступа'),
  ('Серверы');

INSERT INTO "GN_equipment_model" (
  "GN_equipment_model",
  "GN_equipment_manufacturer_FK",
  "GN_equipment_type_FK"
) VALUES
  ('Cisco Catalyst 9300', 1, 1),
  ('HP OfficeConnect 1920S', 2, 1),
  ('Huawei S5735-L24T4X', 3, 1),
  ('Yealink SIP-T54W', 4, 2),
  ('Ubiquiti UniFi U6-Pro', 5, 4);

INSERT INTO "GN_equipment_purchase" (
  "GN_equipment_model_FK",
  "GN_department_FK",
  "GN_budget_network_item_FK",
  "GN_departament_object_FK",
  "GN_purchase_status",
  "GN_purchase_quantity"
) VALUES
  (1, 1, 4, 1, 'готово к закупке', 2),
  (2, 2, 4, 2, 'в закупе', 1),
  (3, 1, 4, 1, 'поставка', 3),
  (4, 3, 2, 5, 'поставленно', 1),
  (5, 2, 4, 2, 'готово к закупке', 2);

-- Initial contract records (requires GN_contractor and GN_dogovor rows to exist).
INSERT INTO "GN_contracts" (
  "GN_contract_contractor_FK",
  "GN_contract_dogovor_FK",
  "GN_contract_sed_launch_date",
  "GN_contract_asez_load_date",
  "GN_contract_state",
  "GN_contract_status_updated_at",
  "GN_contract_approval_status"
) VALUES
  (1, 1, '2026-01-10', '2026-01-12', 'Запущен', '2026-01-13', 'действующий'),
  (2, 2, '2026-01-15', '2026-01-16', 'В работе', '2026-01-17', 'на согласовании'),
  (3, 3, '2026-01-20', '2026-01-22', 'Проверка', '2026-01-23', 'действующий'),
  (4, 4, '2026-01-25', '2026-01-27', 'Согласование', '2026-01-28', 'на согласовании'),
  (5, 5, '2026-02-01', '2026-02-03', 'Завершен', '2026-02-04', 'действующий');

-- Initial invest program records
INSERT INTO "GN_invest_program" (
  "GN_invest_pf_npf",
  "GN_invest_name",
  "GN_invest_quantity",
  "GN_invest_okdp_fk",
  "GN_invest_supplier_fk",
  "GN_invest_ogruz_fk",
  "GN_invest_status",
  "GN_invest_payment",
  "GN_invest_in_budget",
  "GN_invest_peo_code",
  "GN_invest_mtr_code",
  "GN_invest_pzp",
  "GN_invest_agent_report",
  "GN_invest_ap",
  "GN_invest_spec",
  "GN_invest_commissioning",
  "GN_invest_it_accounting",
  "GN_invest_sed_spec",
  "GN_invest_sed_agent_report",
  "GN_invest_state",
  "GN_invest_real_price_no_vat_per_unit",
  "GN_invest_real_sum_no_vat_plus_agent_no_vat",
  "GN_invest_sum_no_vat"
) VALUES
  ('ПФ', 'Маршрутизатор Cisco ISR 4331', 1, 1, 1, 1, 'Активен', 'Оплачен', 'Да', 'ПЭО-001', 'MTR-1000', 'ПЗП-1', 'Агент-1', 'АП-1', 'СП-100', 'Q1 2027', 'Да', 'СЭД-1', 'СЭД Агент-1', 'Запущен', 10000, 11000, 12000),
  ('НПФ', 'Коммутатор Huawei S5735-L24T4X', 2, 2, 2, 2, 'В работе', 'Частично', 'Да', 'ПЭО-002', 'MTR-1001', 'ПЗП-2', 'Агент-2', 'АП-2', 'СП-101', 'Q2 2027', 'Нет', 'СЭД-2', 'СЭД Агент-2', 'Завершен', 15000, 16500, 18000),
  ('ПФ', 'Точка доступа Ubiquiti UniFi U6-Pro', 3, 3, 3, 3, 'Завершен', 'Оплачен', 'Да', 'ПЭО-003', 'MTR-1002', 'ПЗП-3', 'Агент-3', 'АП-3', 'СП-102', 'Q3 2027', 'Да', 'СЭД-3', 'СЭД Агент-3', 'Завершен', 8000, 8800, 9600),
  ('НПФ', 'IP-телефон Yealink SIP-T54W', 1, 4, 4, 4, 'Активен', 'Не оплачен', 'Нет', 'ПЭО-004', 'MTR-1003', 'ПЗП-4', 'Агент-4', 'АП-4', 'СП-103', 'Q4 2027', 'Нет', 'СЭД-4', 'СЭД Агент-4', 'Проверка', 5000, 5500, 6000),
  ('ПФ', 'Радиомодем Eltex WOP-2ac-LR5', 2, 5, 5, 5, 'В работе', 'Частично', 'Да', 'ПЭО-005', 'MTR-1004', 'ПЗП-5', 'Агент-5', 'АП-5', 'СП-104', 'Q1 2028', 'Да', 'СЭД-5', 'СЭД Агент-5', 'Согласование', 12000, 13200, 14400);

-- Initial contract additional agreements
INSERT INTO "GN_contract_additional_agreements" (
  "GN_contract_id_FK",
  "GN_additional_agreement_number",
  "GN_additional_agreement_date",
  "GN_additional_agreement_description",
  "GN_additional_agreement_amount",
  "GN_additional_agreement_status"
) VALUES
  (1, 'ДС-001', '2026-02-01', 'Увеличение объема работ', 50000, 'действующий'),
  (1, 'ДС-002', '2026-03-15', 'Изменение сроков', 0, 'на согласовании'),
  (2, 'ДС-003', '2026-04-10', 'Дополнительные материалы', 25000, 'действующий'),
  (3, 'ДС-004', '2026-05-20', 'Корректировка цены', -10000, 'на согласовании');

-- Initial BDR records
INSERT INTO "GN_bdr" (
  "PAO_budget_network_item_FK",
  "GN_department_FK",
  "GN_departament_object_FK",
  "GN_dogovor_FK",
  "GN_contracor_FK",
  "GN_budget_network_item_FK",
  "GN_bdr_predmet_dogovora",
  "GN_bdr_ed.izm",
  "GN_bdr_kol-vo",
  "GN_bdr_limit",
  "GN_bdr_edin.limit",
  "GN_bdr_comments"
) VALUES
  (1, 1, 1, 1, 1, 1, 'Мобильный интернет 10 ГБ',           'шт.',    10,  48000,  400,  'Тариф для сотрудников ИТ-отдела'),
  (2, 2, 2, 2, 2, 2, 'Фиксированная телефония 100 Мбит',   'мес.',    1,   7800,  650,  'Основной канал серверной комнаты'),
  (3, 3, 5, 3, 3, 3, 'Корпоративная мобильная связь',       'номер',  15, 171000,  950,  'Пакет для бухгалтерии'),
  (4, 4, 3, 4, 4, 4, 'SIM-карты сотрудников',               'шт.',    20,  43200,  180,  'Резервные SIM для филиала'),
  (5, 5, 4, 5, 5, 5, 'Широкополосный доступ в интернет',    'мес.',    1,  50400, 4200,  'Инфраструктура склада'),
  (1, 1, 1, 2, 2, 2, 'VPN-доступ для сотрудников',          'мес.',    1,   3600,  300,  'Защищённый доступ ИТ-отдела'),
  (2, 2, 2, 3, 3, 1, 'Облачный колл-центр 1000 мин.',       'пакет',   1,  26400, 2200,  'Поддержка клиентов'),
  (3, 4, 3, 1, 1, 3, 'Международный роуминг',               'мес.',    3,  35640,  990,  'Командировки руководства'),
  (4, 5, 4, 4, 4, 4, 'SMS-пакет 500',                       'пакет',   5,   7200,  120,  'Уведомления клиентов'),
  (5, 3, 5, 5, 5, 5, 'Резервный канал связи',               'канал',   2,  84000, 3500,  'Резервирование основного канала');
