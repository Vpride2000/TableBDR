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


CREATE TABLE IF NOT EXISTS "GN_contracts" (
	"GN_contract_id" SERIAL NOT NULL UNIQUE,
	"GN_contract_contractor_FK" INTEGER NOT NULL,
	"GN_contract_dogovor_FK" INTEGER NOT NULL,
	"GN_contract_sed_launch_date" DATE NOT NULL,
	"GN_contract_asez_load_date" DATE NOT NULL,
	"GN_contract_state" TEXT NOT NULL,
	"GN_contract_status_updated_at" DATE NOT NULL,
	PRIMARY KEY("GN_contract_id")
);

COMMENT ON TABLE "GN_contracts" IS 'Договора';


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



ALTER TABLE "GN_dogovor"
ADD FOREIGN KEY("GN_contarctor_FK") REFERENCES "GN_contractor"("GN_c_id")
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_departament_object"
ADD FOREIGN KEY("GN_department_FK") REFERENCES "GN_department"("GN_Dep_id")
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_contracts"
ADD FOREIGN KEY("GN_contract_contractor_FK") REFERENCES "GN_contractor"("GN_c_id")
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE "GN_contracts"
ADD FOREIGN KEY("GN_contract_dogovor_FK") REFERENCES "GN_dogovor"("GN_dgv_id")
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