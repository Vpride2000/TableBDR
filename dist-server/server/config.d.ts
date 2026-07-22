export interface GnTableConfig {
    tableName: string;
    idColumn: string;
    editableColumns: string[];
}
export interface LimitCalculationLineInput {
    quantity: number;
    tariff: number;
    note: string;
}
export interface LimitCalculationLineRow {
    line_order: number;
    quantity: string | number;
    tariff: string | number;
    line_note: string;
}
export interface LimitCalculationResponseLine {
    lineOrder: number;
    quantity: number;
    tariff: number;
    note: string;
}
export interface ForecastMonthlyApiRowInput {
    rowId?: unknown;
    monthlyValues?: unknown;
    monthlyFactValues?: unknown;
}
export interface ForecastMonthlyDbRow {
    row_id: number | string;
    month_index: number | string;
    month_value: number | string;
    month_fact_value: number | string;
}
export declare const GN_TABLE_CONFIGS: Record<string, GnTableConfig>;
export declare const BDR_SELECT_FIELDS = "SELECT\n  b.\"GN_bdr_ID\",\n  pao.\"PAO__budget_network_item\"    AS \"\u0421\u0442\u0430\u0442\u044C\u044F \u0431\u044E\u0434\u0436\u0435\u0442\u0430 \u0423\u0421\",\n  dep.\"GN_department\"               AS \"\u041F\u043E\u0434\u0440\u0430\u0437\u0434\u0435\u043B\u0435\u043D\u0438\u0435\",\n  obj.\"GN_departament_object\"       AS \"\u041E\u0431\u044A\u0435\u043A\u0442\",\n  dgv.\"GN_dogovor\"                  AS \"\u0414\u043E\u0433\u043E\u0432\u043E\u0440\",\n  cnt.\"GN_contarctor\"               AS \"\u041A\u043E\u043D\u0442\u0440\u0430\u0433\u0435\u043D\u0442\",\n  bni.\"GN_budget_network_item\"      AS \"\u0421\u0442\u0430\u0442\u044C\u044F \u0431\u044E\u0434\u0436\u0435\u0442\u0430\",\n  b.\"GN_bdr_predmet_dogovora\"       AS \"\u041F\u0440\u0435\u0434\u043C\u0435\u0442 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0430\",\n  b.\"GN_bdr_ed.izm\"                 AS \"\u0415\u0434. \u0438\u0437\u043C.\",\n  b.\"GN_bdr_kol-vo\"                 AS \"\u041A\u043E\u043B-\u0432\u043E\",\n  b.\"GN_bdr_limit\"                  AS \"\u041B\u0438\u043C\u0438\u0442\",\n  b.\"GN_bdr_bdr25_corr\"             AS \"\u0411\u0414\u042025\u043A\u043E\u0440\u0440\",\n  b.\"GN_bdr_bdr26\"                  AS \"\u0411\u0414\u042026\",\n  b.\"GN_bdr_bdr26_corr\"             AS \"\u0411\u0414\u042026\u043A\u043E\u0440\u0440\",\n  b.\"GN_bdr_edin.limit\"             AS \"\u0415\u0434\u0438\u043D. \u043B\u0438\u043C\u0438\u0442\",\n  b.\"GN_bdr_comments\"               AS \"\u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u044F\"\nFROM \"GN_bdr\" b\nJOIN \"PAO__budget_network_item\" pao ON b.\"PAO_budget_network_item_FK\" = pao.\"PAO_b_id\"\nJOIN \"GN_department\"            dep ON b.\"GN_department_FK\"           = dep.\"GN_Dep_id\"\nJOIN \"GN_departament_object\"    obj ON b.\"GN_departament_object_FK\"   = obj.\"GN_do_id\"\nJOIN \"GN_dogovor\"               dgv ON b.\"GN_dogovor_FK\"              = dgv.\"GN_dgv_id\"\nJOIN \"GN_contractor\"            cnt ON b.\"GN_contracor_FK\"            = cnt.\"GN_c_id\"\nJOIN \"GN_budget_network_item\"   bni ON b.\"GN_budget_network_item_FK\"  = bni.\"GN_b_id\"";
//# sourceMappingURL=config.d.ts.map