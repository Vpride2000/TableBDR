import { randomUUID } from 'crypto';
import { createDbClient, toFiniteNumber, buildFallbackCalculationLine } from './db.js';
import { GN_TABLE_CONFIGS, BDR_SELECT_FIELDS } from './config.js';
// Маршруты backend-сервера.
// Этот модуль регистрирует HTTP endpoints для получения и сохранения данных
// по прогнозам, всем сущностям GN и расчету лимитов.
export function setupRoutes(app) {
    const satellitesControlUsers = {
        ADM: process.env.SAT_CTRL_PASS_ADM ?? '',
        'ВГГФ': process.env.SAT_CTRL_PASS_VGGF ?? '',
        'СГГФ': process.env.SAT_CTRL_PASS_SGGF ?? '',
        'ТГГФ': process.env.SAT_CTRL_PASS_TGGF ?? '',
    };
    const satellitesControlSessions = new Map();
    const satellitesSessionTtlMs = 8 * 60 * 60 * 1000;
    function getSatellitesUserByToken(req) {
        const authHeader = String(req.headers.authorization ?? '').trim();
        if (!authHeader.toLowerCase().startsWith('bearer '))
            return null;
        const token = authHeader.slice(7).trim();
        if (!token)
            return null;
        const session = satellitesControlSessions.get(token);
        if (!session)
            return null;
        if (session.expiresAt < Date.now()) {
            satellitesControlSessions.delete(token);
            return null;
        }
        return session.user;
    }
    function normalizeMacKey(value) {
        return String(value ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    }
    function parseAmount(value) {
        const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
        const numeric = Number(normalized);
        return Number.isFinite(numeric) ? numeric : 0;
    }
    function toNullableTrimmedText(value) {
        const normalized = String(value ?? '').trim();
        return normalized === '' ? null : normalized;
    }
    function buildCellularRowKey(account, identifier, icc) {
        return `${account ?? ''}||${identifier}||${icc ?? ''}`;
    }
    // Health check
    // Простой endpoint для проверки, что сервер доступен.
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok' });
    });
    app.get('/api/satellites/summary', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`SELECT
           COUNT(*)::text AS "satelliteCount",
           COUNT(DISTINCT s."GN_satellite_id") FILTER (WHERE EXISTS (
             SELECT 1
             FROM "GN_satellite_xml_monthly" x
             WHERE x."mac_norm" = REPLACE(UPPER(COALESCE(s."GN_satellite_mac", '')), ':', '')
               AND x."amount_without_vat" > 0
           ))::text AS "activeSatelliteCount",
           COUNT(DISTINCT s."GN_department_FK")::text AS "departmentCount",
           COUNT(DISTINCT NULLIF(TRIM(s."GN_satellite_direction_name"), ''))::text AS "directionCount"
         FROM "GN_satellites" s`);
            const row = result.rows[0];
            res.json({
                satelliteCount: Number(row?.satelliteCount ?? 0),
                activeSatelliteCount: Number(row?.activeSatelliteCount ?? 0),
                departmentCount: Number(row?.departmentCount ?? 0),
                directionCount: Number(row?.directionCount ?? 0),
            });
        }
        catch (err) {
            console.error('Failed to fetch satellites summary', err);
            res.status(500).json({ error: 'Failed to fetch satellites summary' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/satellites/auth', (req, res) => {
        const payload = req.body;
        const username = String(payload?.username ?? '').trim();
        const password = String(payload?.password ?? '');
        if (!username || !password) {
            res.status(400).json({ error: 'Требуются логин и пароль' });
            return;
        }
        const expectedPassword = satellitesControlUsers[username];
        if (!expectedPassword) {
            res.status(401).json({ error: 'Неверный логин или пароль' });
            return;
        }
        if (password !== expectedPassword) {
            res.status(401).json({ error: 'Неверный логин или пароль' });
            return;
        }
        const token = randomUUID();
        satellitesControlSessions.set(token, {
            user: username,
            expiresAt: Date.now() + satellitesSessionTtlMs,
        });
        res.json({ ok: true, user: username, token });
    });
    // Satellites control route
    // Получение данных о спутниковых услугах с информацией о подразделениях
    app.get('/api/satellites', async (req, res) => {
        const authUser = getSatellitesUserByToken(req);
        if (!authUser) {
            res.status(401).json({ error: 'Требуется авторизация' });
            return;
        }
        const client = await createDbClient();
        try {
            const branchFilter = authUser === 'ADM' ? null : `%${authUser}%`;
            const result = await client.query(`SELECT
           s."GN_satellite_id",
           s."GN_satellite_mac",
           s."GN_satellite_direction_name",
           s."GN_satellite_description",
           d."GN_Dep_id",
           d."GN_department",
           s."GN_satellite_gt_numbers_FK",
           s."GN_satellite_diameter",
           s."GN_satellite_power",
           s."GN_satellite_model",
           s."GN_satellite_modem"
         FROM "GN_satellites" s
         LEFT JOIN "GN_department" d ON s."GN_department_FK" = d."GN_Dep_id"
         WHERE ($1::text IS NULL OR COALESCE(d."GN_department", '') ILIKE $1)
         ORDER BY s."GN_satellite_id" ASC`, [branchFilter]);
            res.json({ satellites: result.rows });
        }
        catch (err) {
            console.error('Failed to fetch satellites', err);
            res.status(500).json({ error: 'Failed to fetch satellites' });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/satellites/:id', async (req, res) => {
        const authUser = getSatellitesUserByToken(req);
        if (!authUser) {
            res.status(401).json({ error: 'Требуется авторизация' });
            return;
        }
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            res.status(400).json({ error: 'Некорректный id' });
            return;
        }
        const payload = req.body;
        const mac = String(payload.mac ?? '').trim();
        const directionName = String(payload.directionName ?? '').trim();
        const description = String(payload.description ?? '').trim();
        const departmentIdRaw = payload.departmentId;
        const departmentId = departmentIdRaw == null || departmentIdRaw === ''
            ? null
            : Number(departmentIdRaw);
        const gtNumbersFKRaw = payload.gtNumbersFK;
        const gtNumbersFK = gtNumbersFKRaw == null || gtNumbersFKRaw === ''
            ? null
            : Number(gtNumbersFKRaw);
        const diameter = String(payload.diameter ?? '').trim();
        const power = String(payload.power ?? '').trim();
        const model = String(payload.model ?? '').trim();
        const modem = String(payload.modem ?? '').trim();
        if (!mac || !directionName) {
            res.status(400).json({ error: 'MAC и имя направления обязательны' });
            return;
        }
        if (departmentId !== null && (!Number.isFinite(departmentId) || departmentId <= 0)) {
            res.status(400).json({ error: 'Некорректное подразделение' });
            return;
        }
        if (gtNumbersFK !== null && (!Number.isFinite(gtNumbersFK) || gtNumbersFK <= 0)) {
            res.status(400).json({ error: 'Некорректный номер ГТ' });
            return;
        }
        const client = await createDbClient();
        try {
            const updated = await client.query(`UPDATE "GN_satellites" s
         SET
           "GN_satellite_mac" = $1,
           "GN_satellite_direction_name" = $2,
           "GN_satellite_description" = $3,
           "GN_department_FK" = $4,
           "GN_satellite_gt_numbers_FK" = $5,
           "GN_satellite_diameter" = $6,
           "GN_satellite_power" = $7,
           "GN_satellite_model" = $8,
           "GN_satellite_modem" = $9
         WHERE s."GN_satellite_id" = $10
         RETURNING
           s."GN_satellite_id",
           s."GN_satellite_mac",
           s."GN_satellite_direction_name",
           s."GN_satellite_description",
           s."GN_department_FK",
           s."GN_satellite_gt_numbers_FK",
           s."GN_satellite_diameter",
           s."GN_satellite_power",
           s."GN_satellite_model",
           s."GN_satellite_modem"`, [mac, directionName, description || null, departmentId, gtNumbersFK, diameter || null, power || null, model || null, modem || null, id]);
            if (updated.rowCount === 0) {
                res.status(404).json({ error: 'Спутник не найден' });
                return;
            }
            const row = updated.rows[0];
            const dep = await client.query(`SELECT "GN_department" FROM "GN_department" WHERE "GN_Dep_id" = $1 LIMIT 1`, [row.GN_department_FK]);
            res.json({
                GN_satellite_id: row.GN_satellite_id,
                GN_satellite_mac: row.GN_satellite_mac,
                GN_satellite_direction_name: row.GN_satellite_direction_name,
                GN_satellite_description: row.GN_satellite_description,
                GN_Dep_id: row.GN_department_FK,
                GN_department: dep.rows[0]?.GN_department ?? null,
                GN_satellite_gt_numbers_FK: row.GN_satellite_gt_numbers_FK,
                GN_satellite_diameter: row.GN_satellite_diameter,
                GN_satellite_power: row.GN_satellite_power,
                GN_satellite_model: row.GN_satellite_model,
                GN_satellite_modem: row.GN_satellite_modem,
            });
        }
        catch (err) {
            console.error('Failed to update satellite', err);
            res.status(500).json({ error: 'Failed to update satellite' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/satellites/xml-monthly', async (req, res) => {
        const authUser = getSatellitesUserByToken(req);
        if (!authUser) {
            res.status(401).json({ error: 'Требуется авторизация' });
            return;
        }
        const client = await createDbClient();
        try {
            const branchFilter = authUser === 'ADM' ? null : `%${authUser}%`;
            const result = await client.query(`SELECT
           x."mac_norm" AS mac_norm,
           x."month_name" AS month_name,
           x."branch" AS branch,
           x."tariff" AS tariff,
           x."tariff_note" AS tariff_note,
           x."status" AS status,
           x."amount_without_vat" AS amount_without_vat,
           x."uploaded_at" AS uploaded_at
         FROM "GN_satellite_xml_monthly" x
         LEFT JOIN "GN_satellites" s ON REPLACE(UPPER(COALESCE(s."GN_satellite_mac", '')), ':', '') = x."mac_norm"
         LEFT JOIN "GN_department" d ON s."GN_department_FK" = d."GN_Dep_id"
         WHERE ($1::text IS NULL OR COALESCE(d."GN_department", '') ILIKE $1)
         ORDER BY x."month_name" ASC, x."mac_norm" ASC`, [branchFilter]);
            res.json({ rows: result.rows });
        }
        catch (err) {
            console.error('Failed to fetch satellites xml monthly', err);
            res.status(500).json({ error: 'Failed to fetch satellites xml monthly' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/satellites/xml-monthly', async (req, res) => {
        const authUser = getSatellitesUserByToken(req);
        if (!authUser) {
            res.status(401).json({ error: 'Требуется авторизация' });
            return;
        }
        const payload = req.body;
        if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
            res.status(400).json({ error: 'rows are required' });
            return;
        }
        const client = await createDbClient();
        try {
            await client.query('BEGIN');
            for (const row of payload.rows) {
                const macNorm = normalizeMacKey(row.macAddress ?? '');
                const monthName = String(row.month ?? '').trim();
                if (!macNorm || !monthName) {
                    continue;
                }
                await client.query(`INSERT INTO "GN_satellite_xml_monthly" (
             "mac_norm",
             "month_name",
             "branch",
             "tariff",
             "tariff_note",
             "status",
             "amount_without_vat",
             "uploaded_by"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ("mac_norm", "month_name")
           DO UPDATE SET
             "branch" = EXCLUDED."branch",
             "tariff" = EXCLUDED."tariff",
             "tariff_note" = EXCLUDED."tariff_note",
             "status" = EXCLUDED."status",
             "amount_without_vat" = EXCLUDED."amount_without_vat",
             "uploaded_by" = EXCLUDED."uploaded_by",
             "uploaded_at" = NOW()`, [
                    macNorm,
                    monthName,
                    String(row.branch ?? '').trim() || null,
                    String(row.tariff ?? '').trim() || null,
                    String(row.tariffNote ?? '').trim() || null,
                    ['сломан', 'склад', 'в работе', 'отключен', 'ошибка'].includes(String(row.status ?? '').trim().toLowerCase())
                        ? String(row.status ?? '').trim().toLowerCase()
                        : 'склад',
                    parseAmount(row.amountWithoutVat),
                    authUser,
                ]);
            }
            await client.query('COMMIT');
            res.json({ ok: true });
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('Failed to save satellites xml monthly', err);
            res.status(500).json({ error: 'Failed to save satellites xml monthly' });
        }
        finally {
            await client.end();
        }
    });
    app.delete('/api/satellites/xml-monthly/:month', async (req, res) => {
        const authUser = getSatellitesUserByToken(req);
        if (!authUser) {
            res.status(401).json({ error: 'Требуется авторизация' });
            return;
        }
        if (authUser !== 'ADM') {
            res.status(403).json({ error: 'Очистка доступна только пользователю АДМ' });
            return;
        }
        const month = decodeURIComponent(String(req.params.month ?? '')).trim();
        if (!month) {
            res.status(400).json({ error: 'month is required' });
            return;
        }
        const client = await createDbClient();
        try {
            const cleared = await client.query(`UPDATE "GN_satellite_xml_monthly"
         SET
           "tariff" = NULL,
           "tariff_note" = NULL,
           "amount_without_vat" = 0,
           "uploaded_at" = NOW()
         WHERE "month_name" = $1`, [month]);
            res.json({ ok: true, clearedRows: cleared.rowCount ?? 0 });
        }
        catch (err) {
            console.error('Failed to clear satellites xml month', err);
            res.status(500).json({ error: 'Failed to clear satellites xml month' });
        }
        finally {
            await client.end();
        }
    });
    // Forecast monthly routes
    // Работа с таблицей ежемесячного прогноза: чтение и сохранение данных.
    app.get('/api/gn/forecast-monthly', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`SELECT
           "GN_bdr_ID_FK" AS row_id,
           "month_index" AS month_index,
          "month_value" AS month_value,
          "month_fact_value" AS month_fact_value
         FROM "GN_bdr_monthly_forecast"
         WHERE "GN_bdr_ID_FK" IS NOT NULL
         ORDER BY
           "GN_bdr_ID_FK" ASC,
           "month_index" ASC`);
            const grouped = new Map();
            result.rows.forEach((row) => {
                const rowId = Number(row.row_id);
                const monthIndex = Number(row.month_index);
                const monthValue = Number(row.month_value ?? 0);
                const monthFactValue = Number(row.month_fact_value ?? 0);
                if (!Number.isFinite(rowId)) {
                    return;
                }
                const existing = grouped.get(rowId) ?? {
                    rowId,
                    monthlyValues: new Array(12).fill(0),
                    monthlyFactValues: new Array(12).fill(0),
                };
                if (monthIndex >= 0 && monthIndex < 12) {
                    existing.monthlyValues[monthIndex] = Number.isFinite(monthValue) ? monthValue : 0;
                    existing.monthlyFactValues[monthIndex] = Number.isFinite(monthFactValue) ? monthFactValue : 0;
                }
                grouped.set(rowId, existing);
            });
            res.json({ rows: [...grouped.values()] });
        }
        catch (err) {
            console.error('Failed to fetch monthly forecast', err);
            res.status(500).json({ error: 'Failed to fetch monthly forecast' });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/gn/forecast-monthly', async (req, res) => {
        const payload = req.body;
        // Получаем и валидируем массив строк прогноза из тела запроса.
        if (!Array.isArray(payload.rows)) {
            res.status(400).json({ error: 'Rows are required' });
            return;
        }
        const validatedRows = [];
        try {
            payload.rows.forEach((row, index) => {
                const monthlyValuesRaw = row.monthlyValues;
                if (!Array.isArray(monthlyValuesRaw) || monthlyValuesRaw.length !== 12) {
                    throw new Error(`Invalid monthlyValues in row ${index + 1}`);
                }
                const monthlyValues = monthlyValuesRaw.map((value, monthIndex) => toFiniteNumber(value, `row ${index + 1} month ${monthIndex + 1}`));
                const monthlyFactValuesRaw = row.monthlyFactValues;
                const monthlyFactValues = Array.isArray(monthlyFactValuesRaw)
                    ? monthlyFactValuesRaw.map((value, monthIndex) => toFiniteNumber(value, `row ${index + 1} fact month ${monthIndex + 1}`))
                    : new Array(12).fill(0);
                if (monthlyFactValues.length !== 12) {
                    throw new Error(`Invalid monthlyFactValues in row ${index + 1}`);
                }
                validatedRows.push({
                    rowId: toFiniteNumber(row.rowId, `row ${index + 1} rowId`),
                    monthlyValues,
                    monthlyFactValues,
                });
            });
        }
        catch (err) {
            res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid payload' });
            return;
        }
        const client = await createDbClient();
        try {
            await client.query('BEGIN');
            for (const row of validatedRows) {
                const namesResult = await client.query(`SELECT
             COALESCE(NULLIF(TRIM(bni."GN_budget_network_item"), ''), '—') AS budget_item,
             COALESCE(NULLIF(TRIM(cnt."GN_contarctor"), ''), '—') AS contractor,
             COALESCE(NULLIF(TRIM(dgv."GN_dogovor"), ''), '—') AS dogovor,
             COALESCE(NULLIF(TRIM(dep."GN_department"), ''), '—') AS department
           FROM "GN_bdr" b
           JOIN "GN_budget_network_item" bni ON b."GN_budget_network_item_FK" = bni."GN_b_id"
           JOIN "GN_contractor" cnt ON b."GN_contracor_FK" = cnt."GN_c_id"
           JOIN "GN_dogovor" dgv ON b."GN_dogovor_FK" = dgv."GN_dgv_id"
           JOIN "GN_department" dep ON b."GN_department_FK" = dep."GN_Dep_id"
           WHERE b."GN_bdr_ID" = $1
           LIMIT 1`, [row.rowId]);
                if (namesResult.rowCount === 0) {
                    throw new Error(`Row ${row.rowId} not found`);
                }
                const names = namesResult.rows[0];
                for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
                    await client.query(`INSERT INTO "GN_bdr_monthly_forecast" (
               "GN_bdr_ID_FK",
               "budget_item",
               "contractor",
               "dogovor",
               "department",
               "month_index",
               "month_value",
               "month_fact_value"
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT ("GN_bdr_ID_FK", "month_index") WHERE "GN_bdr_ID_FK" IS NOT NULL
             DO UPDATE SET
               "budget_item" = EXCLUDED."budget_item",
               "contractor" = EXCLUDED."contractor",
               "dogovor" = EXCLUDED."dogovor",
               "department" = EXCLUDED."department",
               "month_value" = EXCLUDED."month_value",
               "month_fact_value" = EXCLUDED."month_fact_value",
               "updated_at" = NOW()`, [
                        row.rowId,
                        names.budget_item,
                        names.contractor,
                        names.dogovor,
                        names.department,
                        monthIndex,
                        row.monthlyValues[monthIndex],
                        row.monthlyFactValues[monthIndex],
                    ]);
                }
                const rowLimit = row.monthlyValues.reduce((sum, value) => sum + value, 0);
                await client.query(`UPDATE "GN_bdr"
           SET "GN_bdr_limit" = $1
           WHERE "GN_bdr_ID" = $2`, [rowLimit, row.rowId]);
            }
            const deleteResult = await client.query(`
        DELETE FROM "GN_bdr_monthly_forecast" forecast
        WHERE forecast."GN_bdr_ID_FK" IS NOT NULL
          AND NOT EXISTS (
          SELECT 1
          FROM "GN_bdr" b
          WHERE b."GN_bdr_ID" = forecast."GN_bdr_ID_FK"
        )
      `);
            // Удаляем устаревшие строки прогноза, связанные с несуществующими BDR.
            const deletedStaleRows = deleteResult.rowCount ?? 0;
            await client.query('COMMIT');
            res.json({
                savedRows: validatedRows.length,
                deletedStaleRows,
            });
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('Failed to save monthly forecast', err);
            res.status(500).json({ error: 'Failed to save monthly forecast' });
        }
        finally {
            await client.end();
        }
    });
    // GN entity routes
    app.get('/api/gn/departments', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_department" ORDER BY "GN_Dep_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_department' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/budget-items', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_budget_network_item" ORDER BY "GN_b_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_budget_network_item' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/pao-budget-items', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "PAO__budget_network_item" ORDER BY "PAO_b_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch PAO__budget_network_item' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/contractors', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_contractor" ORDER BY "GN_c_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_contractor' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/dogovors', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_dogovor" ORDER BY "GN_dgv_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_dogovor' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/objects', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_departament_object" ORDER BY "GN_do_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_departament_object' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/contracts', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`
        SELECT
          c.*,
          d."GN_dogovor" AS "GN_contract_name"
        FROM "GN_contracts" c
        LEFT JOIN "GN_dogovor" d ON c."GN_contract_dogovor_FK" = d."GN_dgv_id"
        ORDER BY c."GN_contract_id" ASC
      `);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_contracts' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/gn/contracts', async (req, res) => {
        const payload = req.body;
        if (!payload || !payload.GN_contract_dogovor_FK) {
            res.status(400).json({ error: 'Missing required fields: GN_contract_dogovor_FK' });
            return;
        }
        const statusUpdatedAt = payload.GN_contract_status_updated_at || new Date().toISOString().slice(0, 10);
        const approvalStatus = payload.GN_contract_approval_status || 'действующий';
        const client = await createDbClient();
        try {
            const result = await client.query(`INSERT INTO "GN_contracts" (
           "GN_contract_contractor_FK",
           "GN_contract_dogovor_FK",
           "GN_contract_sed_launch_date",
           "GN_contract_asez_load_date",
           "GN_contract_state",
           "GN_contract_status_updated_at",
           "GN_contract_approval_status",
           "GN_contract_date",
           "GN_contract_term_from",
           "GN_contract_term_to",
           "GN_contract_side",
           "GN_contract_asez_number"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *,
           (SELECT "GN_dogovor" FROM "GN_dogovor" WHERE "GN_dogovor"."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_contract_name"`, [
                payload.GN_contract_contractor_FK ?? null,
                payload.GN_contract_dogovor_FK,
                payload.GN_contract_sed_launch_date || statusUpdatedAt,
                payload.GN_contract_asez_load_date || statusUpdatedAt,
                payload.GN_contract_state || '',
                statusUpdatedAt,
                approvalStatus,
                payload.GN_contract_date ?? null,
                payload.GN_contract_term_from ?? null,
                payload.GN_contract_term_to ?? null,
                payload.GN_contract_side ?? '',
                payload.GN_contract_asez_number ?? '',
            ]);
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error(err instanceof Error ? (err.stack || err.message) : err);
            res.status(500).json({ error: String(err instanceof Error ? err.message : 'Failed to create GN_contracts') });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/gn/contracts/:id', async (req, res) => {
        const id = Number(req.params.id);
        const payload = req.body;
        if (!Number.isFinite(id)
            || !payload.GN_contract_contractor_FK
            || !payload.GN_contract_dogovor_FK
            || !payload.GN_contract_sed_launch_date
            || !payload.GN_contract_asez_load_date
            || payload.GN_contract_state === undefined) {
            res.status(400).json({ error: 'Invalid contract update payload' });
            return;
        }
        const statusUpdatedAt = payload.GN_contract_status_updated_at || new Date().toISOString().slice(0, 10);
        const approvalStatus = payload.GN_contract_approval_status || 'действующий';
        const client = await createDbClient();
        try {
            const result = await client.query(`UPDATE "GN_contracts"
         SET
           "GN_contract_contractor_FK" = $1,
           "GN_contract_dogovor_FK" = $2,
           "GN_contract_sed_launch_date" = $3,
           "GN_contract_asez_load_date" = $4,
           "GN_contract_state" = $5,
           "GN_contract_status_updated_at" = $6,
           "GN_contract_approval_status" = $7,
           "GN_contract_date" = $8,
           "GN_contract_term_from" = $9,
           "GN_contract_term_to" = $10,
           "GN_contract_side" = $11,
           "GN_contract_asez_number" = $12
         WHERE "GN_contract_id" = $13
         RETURNING *,
           (SELECT "GN_dogovor" FROM "GN_dogovor" WHERE "GN_dogovor"."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_contract_name"`, [
                payload.GN_contract_contractor_FK,
                payload.GN_contract_dogovor_FK,
                payload.GN_contract_sed_launch_date,
                payload.GN_contract_asez_load_date,
                payload.GN_contract_state,
                statusUpdatedAt,
                approvalStatus,
                payload.GN_contract_date ?? null,
                payload.GN_contract_term_from ?? null,
                payload.GN_contract_term_to ?? null,
                payload.GN_contract_side ?? '',
                payload.GN_contract_asez_number ?? '',
                id,
            ]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Contract not found' });
                return;
            }
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update GN_contracts' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/contract-additional-agreements', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`
        SELECT
          caa."GN_additional_agreement_id",
          caa."GN_contract_id_FK",
          caa."GN_additional_agreement_number",
          caa."GN_additional_agreement_date",
          caa."GN_additional_agreement_description",
          caa."GN_additional_agreement_amount",
          caa."GN_additional_agreement_status",
          d."GN_dogovor" AS contract_name
        FROM "GN_contract_additional_agreements" caa
        JOIN "GN_contracts" c ON caa."GN_contract_id_FK" = c."GN_contract_id"
        LEFT JOIN "GN_dogovor" d ON c."GN_contract_dogovor_FK" = d."GN_dgv_id"
        ORDER BY caa."GN_additional_agreement_date" DESC
      `);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_contract_additional_agreements' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/gn/contract-additional-agreements', async (req, res) => {
        const payload = req.body;
        if (!payload.contractId || !payload.number || !payload.date || !payload.description || payload.amount === undefined) {
            res.status(400).json({ error: 'All fields are required' });
            return;
        }
        const status = payload.approvalStatus || 'действующий';
        const validStatuses = ['действующий', 'на согласовании'];
        if (status && !validStatuses.includes(status)) {
            res.status(400).json({ error: `Invalid approval status. Must be one of: ${validStatuses.join(', ')}` });
            return;
        }
        const client = await createDbClient();
        try {
            const result = await client.query(`INSERT INTO "GN_contract_additional_agreements" (
           "GN_contract_id_FK",
           "GN_additional_agreement_number",
           "GN_additional_agreement_date",
           "GN_additional_agreement_description",
           "GN_additional_agreement_amount",
           "GN_additional_agreement_status"
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`, [
                payload.contractId,
                payload.number,
                payload.date,
                payload.description,
                payload.amount,
                status,
            ]);
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to create additional agreement' });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/gn/contract-additional-agreements/:id', async (req, res) => {
        const id = Number(req.params.id);
        const payload = req.body;
        if (!Number.isFinite(id) || !payload.contractId || !payload.number || !payload.date || !payload.description || payload.amount === undefined) {
            res.status(400).json({ error: 'All fields are required' });
            return;
        }
        const status = payload.approvalStatus || 'действующий';
        if (!['действующий', 'на согласовании'].includes(status)) {
            res.status(400).json({ error: 'Invalid approval status' });
            return;
        }
        const client = await createDbClient();
        try {
            const result = await client.query(`UPDATE "GN_contract_additional_agreements"
         SET
           "GN_contract_id_FK" = $1,
           "GN_additional_agreement_number" = $2,
           "GN_additional_agreement_date" = $3,
           "GN_additional_agreement_description" = $4,
           "GN_additional_agreement_amount" = $5,
           "GN_additional_agreement_status" = $6
         WHERE "GN_additional_agreement_id" = $7
         RETURNING *`, [
                payload.contractId,
                payload.number,
                payload.date,
                payload.description,
                payload.amount,
                status,
                id,
            ]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Additional agreement not found' });
                return;
            }
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update additional agreement' });
        }
        finally {
            await client.end();
        }
    });
    app.delete('/api/gn/contract-additional-agreements/:id', async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
            res.status(400).json({ error: 'Invalid ID' });
            return;
        }
        const client = await createDbClient();
        try {
            const result = await client.query('DELETE FROM "GN_contract_additional_agreements" WHERE "GN_additional_agreement_id" = $1', [id]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Additional agreement not found' });
                return;
            }
            res.json({ success: true });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete additional agreement' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/invest-okdp-tko-is-prit', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_invest_okdp_tko_is_prit" ORDER BY "GN_invest_okdp_tko_is_prit_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_invest_okdp_tko_is_prit' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/invest-ogruz-rekvizit', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_invest_ogruz_rekvizit" ORDER BY "GN_invest_ogruz_rekvizit_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_invest_ogruz_rekvizit' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/equipment-manufacturers', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_equipment_manufacturer" ORDER BY "GN_equipment_manufacturer_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_equipment_manufacturer' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/equipment-types', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_equipment_type" ORDER BY "GN_equipment_type_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_equipment_type' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/equipment-models', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_equipment_model" ORDER BY "GN_equipment_model_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_equipment_model' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/satellite-gt-numbers', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query('SELECT * FROM "GN_satellite_gt_numbers" ORDER BY "GN_satellite_gt_numbers_id" ASC');
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_satellite_gt_numbers' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/cellular-account-options', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`SELECT DISTINCT
           c."GN_cellular_account",
           a."GN_cellular_account_id",
           d."GN_department"
         FROM "GN_cellular" c
         LEFT JOIN "GN_cellular_account" a ON a."GN_cellular_account" = c."GN_cellular_account"
         LEFT JOIN "GN_department" d ON d."GN_Dep_id" = a."GN_department_FK"
         WHERE c."GN_cellular_account" IS NOT NULL
         ORDER BY c."GN_cellular_account" ASC, a."GN_cellular_account_id" ASC`);
            res.json(result.rows
                .map((row) => ({
                account: String(row.GN_cellular_account ?? '').trim(),
                department: String(row.GN_department ?? '').trim(),
            }))
                .filter((row) => row.account));
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_cellular_account_options' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/cellular', async (req, res) => {
        const client = await createDbClient();
        try {
            const accountFilter = String(req.query.account ?? '').trim();
            const accountParam = accountFilter ? accountFilter : null;
            const result = await client.query(`SELECT
           c."GN_cellular_id",
           c."GN_cellular_account",
           c."GN_cellular_client",
           c."GN_cellular_contract_number",
           c."GN_cellular_identifier_FK",
           i."GN_cellular_identifier",
           i."GN_cellular_identifier_fio",
           c."GN_cellular_icc",
           c."GN_cellular_status",
           c."GN_cellular_activation_date",
           c."GN_cellular_zone",
           c."GN_cellular_tariff_plan_FK",
           t."GN_cellular_tariff_plan",
           t."GN_cellular_tariff_plan_details",
           c."GN_cellular_tariff_plan_enabled_date",
           c."GN_cellular_updated_at"
         FROM "GN_cellular" c
         JOIN "GN_cellular_identifier" i ON c."GN_cellular_identifier_FK" = i."GN_cellular_identifier_id"
         JOIN "GN_cellular_tariff_plan" t ON c."GN_cellular_tariff_plan_FK" = t."GN_cellular_tariff_plan_id"
         WHERE ($1::text IS NULL OR c."GN_cellular_account" = $1)
         ORDER BY c."GN_cellular_id" ASC`, [accountParam]);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_cellular' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/gn/cellular/sync', async (req, res) => {
        const payload = req.body;
        if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
            res.status(400).json({ error: 'rows are required' });
            return;
        }
        const client = await createDbClient();
        try {
            await client.query('BEGIN');
            let insertedRows = 0;
            let updatedRows = 0;
            let unchangedRows = 0;
            const changedColumnsByRowKey = {};
            for (const sourceRow of payload.rows) {
                const identifier = String(sourceRow.identifier ?? '').trim();
                const tariffPlan = String(sourceRow.tariffPlan ?? '').trim();
                if (!identifier || !tariffPlan) {
                    continue;
                }
                const account = toNullableTrimmedText(sourceRow.account);
                const icc = toNullableTrimmedText(sourceRow.icc);
                const rowKey = buildCellularRowKey(account, identifier, icc);
                const identifierResult = await client.query(`INSERT INTO "GN_cellular_identifier" ("GN_cellular_identifier")
           VALUES ($1)
           ON CONFLICT ("GN_cellular_identifier")
           DO UPDATE SET "GN_cellular_identifier" = EXCLUDED."GN_cellular_identifier"
           RETURNING "GN_cellular_identifier_id" AS id`, [identifier]);
                const identifierId = identifierResult.rows[0].id;
                const tariffResult = await client.query(`INSERT INTO "GN_cellular_tariff_plan" ("GN_cellular_tariff_plan")
           VALUES ($1)
           ON CONFLICT ("GN_cellular_tariff_plan")
           DO UPDATE SET "GN_cellular_tariff_plan" = EXCLUDED."GN_cellular_tariff_plan"
           RETURNING "GN_cellular_tariff_plan_id" AS id`, [tariffPlan]);
                const tariffId = tariffResult.rows[0].id;
                const normalizedRow = {
                    account,
                    client: toNullableTrimmedText(sourceRow.clientName),
                    contractNumber: toNullableTrimmedText(sourceRow.contractNumber),
                    identifierId,
                    identifier,
                    icc,
                    status: toNullableTrimmedText(sourceRow.status),
                    activationDate: toNullableTrimmedText(sourceRow.activationDate),
                    zone: toNullableTrimmedText(sourceRow.zone),
                    tariffId,
                    tariffPlan,
                    tariffPlanEnabledDate: toNullableTrimmedText(sourceRow.tariffPlanEnabledDate),
                };
                const existingResult = await client.query(`SELECT
             c."GN_cellular_id",
             c."GN_cellular_account",
             c."GN_cellular_client",
             c."GN_cellular_contract_number",
             c."GN_cellular_identifier_FK",
             c."GN_cellular_icc",
             c."GN_cellular_status",
             c."GN_cellular_activation_date"::text AS "GN_cellular_activation_date",
             c."GN_cellular_zone",
             c."GN_cellular_tariff_plan_FK",
             c."GN_cellular_tariff_plan_enabled_date"::text AS "GN_cellular_tariff_plan_enabled_date"
           FROM "GN_cellular" c
           WHERE c."GN_cellular_account" IS NOT DISTINCT FROM $1
             AND c."GN_cellular_identifier_FK" = $2
             AND c."GN_cellular_icc" IS NOT DISTINCT FROM $3
           ORDER BY c."GN_cellular_id" ASC
           LIMIT 1`, [normalizedRow.account, normalizedRow.identifierId, normalizedRow.icc]);
                if (existingResult.rowCount === 0) {
                    await client.query(`INSERT INTO "GN_cellular" (
               "GN_cellular_account",
               "GN_cellular_client",
               "GN_cellular_contract_number",
               "GN_cellular_identifier_FK",
               "GN_cellular_icc",
               "GN_cellular_status",
               "GN_cellular_activation_date",
               "GN_cellular_zone",
               "GN_cellular_tariff_plan_FK",
               "GN_cellular_tariff_plan_enabled_date",
               "GN_cellular_updated_at"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`, [
                        normalizedRow.account,
                        normalizedRow.client,
                        normalizedRow.contractNumber,
                        normalizedRow.identifierId,
                        normalizedRow.icc,
                        normalizedRow.status,
                        normalizedRow.activationDate,
                        normalizedRow.zone,
                        normalizedRow.tariffId,
                        normalizedRow.tariffPlanEnabledDate,
                    ]);
                    insertedRows += 1;
                    changedColumnsByRowKey[rowKey] = [
                        'GN_cellular_account',
                        'GN_cellular_client',
                        'GN_cellular_contract_number',
                        'GN_cellular_identifier',
                        'GN_cellular_icc',
                        'GN_cellular_status',
                        'GN_cellular_activation_date',
                        'GN_cellular_zone',
                        'GN_cellular_tariff_plan',
                        'GN_cellular_tariff_plan_enabled_date',
                    ];
                    continue;
                }
                const existing = existingResult.rows[0];
                const changedColumns = [];
                if (existing.GN_cellular_account !== normalizedRow.account)
                    changedColumns.push('GN_cellular_account');
                if (existing.GN_cellular_client !== normalizedRow.client)
                    changedColumns.push('GN_cellular_client');
                if (existing.GN_cellular_contract_number !== normalizedRow.contractNumber)
                    changedColumns.push('GN_cellular_contract_number');
                if (existing.GN_cellular_identifier_FK !== normalizedRow.identifierId)
                    changedColumns.push('GN_cellular_identifier');
                if (existing.GN_cellular_icc !== normalizedRow.icc)
                    changedColumns.push('GN_cellular_icc');
                if (existing.GN_cellular_status !== normalizedRow.status)
                    changedColumns.push('GN_cellular_status');
                if (toNullableTrimmedText(existing.GN_cellular_activation_date) !== normalizedRow.activationDate)
                    changedColumns.push('GN_cellular_activation_date');
                if (existing.GN_cellular_zone !== normalizedRow.zone)
                    changedColumns.push('GN_cellular_zone');
                if (existing.GN_cellular_tariff_plan_FK !== normalizedRow.tariffId)
                    changedColumns.push('GN_cellular_tariff_plan');
                if (toNullableTrimmedText(existing.GN_cellular_tariff_plan_enabled_date) !== normalizedRow.tariffPlanEnabledDate)
                    changedColumns.push('GN_cellular_tariff_plan_enabled_date');
                if (changedColumns.length === 0) {
                    unchangedRows += 1;
                    continue;
                }
                await client.query(`UPDATE "GN_cellular"
           SET
             "GN_cellular_client" = $1,
             "GN_cellular_contract_number" = $2,
             "GN_cellular_status" = $3,
             "GN_cellular_activation_date" = $4,
             "GN_cellular_zone" = $5,
             "GN_cellular_tariff_plan_FK" = $6,
             "GN_cellular_tariff_plan_enabled_date" = $7,
             "GN_cellular_updated_at" = NOW()
           WHERE "GN_cellular_id" = $8`, [
                    normalizedRow.client,
                    normalizedRow.contractNumber,
                    normalizedRow.status,
                    normalizedRow.activationDate,
                    normalizedRow.zone,
                    normalizedRow.tariffId,
                    normalizedRow.tariffPlanEnabledDate,
                    existing.GN_cellular_id,
                ]);
                updatedRows += 1;
                changedColumnsByRowKey[rowKey] = changedColumns;
            }
            await client.query('COMMIT');
            res.json({
                insertedRows,
                updatedRows,
                unchangedRows,
                changedColumnsByRowKey,
            });
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('Failed to sync cellular rows', err);
            res.status(500).json({ error: 'Failed to sync cellular rows' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/cellular-identifiers', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`SELECT *
         FROM "GN_cellular_identifier"
         ORDER BY "GN_cellular_identifier_id" ASC`);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_cellular_identifier' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/cellular-tariff-plans', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`SELECT *
         FROM "GN_cellular_tariff_plan"
         ORDER BY "GN_cellular_tariff_plan_id" ASC`);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_cellular_tariff_plan' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/cellular-accounts', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`SELECT
           a."GN_cellular_account_id",
           a."GN_cellular_account",
           a."GN_department_FK",
           a."GN_cellular_account_note",
           COALESCE(cnt.numbers_count, 0)::int AS "GN_cellular_account_numbers_count",
           COALESCE(cnt.active_numbers_count, 0)::int AS "GN_cellular_account_active_numbers_count",
           COALESCE(cnt.total_cost, 0) AS "GN_cellular_account_total_cost"
         FROM "GN_cellular_account" a
         LEFT JOIN (
           SELECT c."GN_cellular_account", COUNT(*) AS numbers_count,
             COUNT(*) FILTER (WHERE lower(trim(c."GN_cellular_status")) = 'действующий') AS active_numbers_count,
             SUM(CASE WHEN lower(trim(c."GN_cellular_status")) = 'действующий' THEN COALESCE(t."GN_cellular_tariff_plan_cost", 0) ELSE 0 END) AS total_cost
           FROM "GN_cellular" c
           LEFT JOIN "GN_cellular_tariff_plan" t ON t."GN_cellular_tariff_plan_id" = c."GN_cellular_tariff_plan_FK"
           GROUP BY c."GN_cellular_account"
         ) cnt ON cnt."GN_cellular_account" = a."GN_cellular_account"
         ORDER BY a."GN_cellular_account_id" ASC`);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_cellular_account' });
        }
        finally {
            await client.end();
        }
    });
    app.patch('/api/gn/equipment-models/:id', async (req, res) => {
        const client = await createDbClient();
        const id = Number(req.params.id);
        const { model, manufacturer_fk, type_fk, department_fk, budget_item_fk, object_fk, status } = req.body;
        try {
            const result = await client.query(`UPDATE "GN_equipment_model"
         SET "GN_equipment_model" = $1,
           "GN_equipment_manufacturer_FK" = $2,
           "GN_equipment_type_FK" = $3,
           "GN_equipment_department_FK" = $4,
           "GN_equipment_budget_item_FK" = $5,
           "GN_equipment_object_FK" = $6,
           "GN_equipment_status" = $7
         WHERE "GN_equipment_model_id" = $8`, [model, manufacturer_fk || null, type_fk || null, department_fk || null, budget_item_fk || null, object_fk || null, status, id]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Модель оборудования не найдена' });
                return;
            }
            res.json({ success: true });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update GN_equipment_model' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/invest-program', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`
        SELECT
          ip."GN_invest_program_id",
          ip."GN_invest_pf_npf",
          ip."GN_invest_name",
          ip."GN_invest_quantity",
          okdp."GN_invest_okdp_tko_is_prit" AS "GN_invest_okdp",
          sup."GN_contarctor" AS "GN_invest_supplier",
          ogr."GN_invest_ogruz_rekvizit" AS "GN_invest_ogruz",
          ip."GN_invest_status",
          ip."GN_invest_payment",
          ip."GN_invest_in_budget",
          ip."GN_invest_peo_code",
          ip."GN_invest_mtr_code",
          ip."GN_invest_pzp",
          ip."GN_invest_agent_report",
          ip."GN_invest_ap",
          ip."GN_invest_spec",
          ip."GN_invest_commissioning",
          ip."GN_invest_it_accounting",
          ip."GN_invest_sed_spec",
          ip."GN_invest_sed_agent_report",
          ip."GN_invest_state",
          ip."GN_invest_real_price_no_vat_per_unit",
          ip."GN_invest_real_sum_no_vat_plus_agent_no_vat",
          ip."GN_invest_sum_no_vat"
        FROM "GN_invest_program" ip
        LEFT JOIN "GN_invest_okdp_tko_is_prit" okdp ON ip."GN_invest_okdp_fk" = okdp."GN_invest_okdp_tko_is_prit_id"
        LEFT JOIN "GN_contractor" sup ON ip."GN_invest_supplier_fk" = sup."GN_c_id"
        LEFT JOIN "GN_invest_ogruz_rekvizit" ogr ON ip."GN_invest_ogruz_fk" = ogr."GN_invest_ogruz_rekvizit_id"
        ORDER BY ip."GN_invest_program_id" ASC
      `);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_invest_program' });
        }
        finally {
            await client.end();
        }
    });
    // BDR routes
    app.get('/api/gn/bdr/:id', async (req, res) => {
        const rowId = Number(req.params.id);
        if (Number.isNaN(rowId)) {
            res.status(400).json({ error: 'Invalid row id' });
            return;
        }
        const client = await createDbClient();
        try {
            const result = await client.query(`${BDR_SELECT_FIELDS}
         WHERE b."GN_bdr_ID" = $1`, [rowId]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Row not found' });
                return;
            }
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_bdr row' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/bdr/:id/limit-calculation', async (req, res) => {
        const rowId = Number(req.params.id);
        if (Number.isNaN(rowId)) {
            res.status(400).json({ error: 'Invalid row id' });
            return;
        }
        const client = await createDbClient();
        try {
            const baseResult = await client.query(`SELECT
           "GN_bdr_kol-vo" AS quantity,
           "GN_bdr_limit" AS limit_total,
           "GN_bdr_edin.limit" AS unit_limit,
           "GN_bdr_comments" AS comments
         FROM "GN_bdr"
         WHERE "GN_bdr_ID" = $1
         LIMIT 1`, [rowId]);
            if (baseResult.rowCount === 0) {
                res.status(404).json({ error: 'Row not found' });
                return;
            }
            const base = baseResult.rows[0];
            const quantity = Number(base.quantity ?? 0);
            const storedLimit = Number(base.limit_total ?? 0);
            const unitLimit = Number(base.unit_limit ?? 0);
            const lineResult = await client.query(`SELECT
           "line_order" AS line_order,
           "quantity" AS quantity,
           "tariff" AS tariff,
           "line_note" AS line_note
         FROM "GN_bdr_limit_calculation"
         WHERE "GN_bdr_ID_FK" = $1
         ORDER BY "line_order" ASC`, [rowId]);
            const lines = lineResult.rows.length > 0
                ? lineResult.rows.map((line) => ({
                    lineOrder: Number(line.line_order),
                    quantity: Number(line.quantity ?? 0),
                    tariff: Number(line.tariff ?? 0),
                    note: String(line.line_note ?? ''),
                }))
                : [buildFallbackCalculationLine(quantity, storedLimit, unitLimit)];
            const totalByLines = lines.reduce((acc, line) => acc + line.quantity * line.tariff, 0);
            const calculatedLimit = totalByLines + unitLimit;
            res.json({
                rowId,
                unitLimit,
                comments: String(base.comments ?? ''),
                lines,
                totalByLines,
                calculatedLimit,
                storedLimit,
                difference: storedLimit - calculatedLimit,
            });
        }
        catch (err) {
            console.error('Failed to fetch limit calculation', err);
            res.status(500).json({ error: 'Failed to fetch limit calculation' });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/gn/bdr/:id/limit-calculation', async (req, res) => {
        const rowId = Number(req.params.id);
        if (Number.isNaN(rowId)) {
            res.status(400).json({ error: 'Invalid row id' });
            return;
        }
        const payload = req.body;
        if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
            res.status(400).json({ error: 'Lines are required' });
            return;
        }
        let unitLimit;
        const lines = [];
        try {
            unitLimit = toFiniteNumber(payload.unitLimit ?? 0, 'unitLimit');
            payload.lines.forEach((line, index) => {
                const quantity = toFiniteNumber(line.quantity ?? 0, `line ${index + 1} quantity`);
                const tariff = toFiniteNumber(line.tariff ?? 0, `line ${index + 1} tariff`);
                lines.push({
                    quantity,
                    tariff,
                    note: String(line.note ?? ''),
                });
            });
        }
        catch (err) {
            res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid payload' });
            return;
        }
        const client = await createDbClient();
        try {
            await client.query('BEGIN');
            const baseResult = await client.query(`SELECT "GN_bdr_comments" AS comments
         FROM "GN_bdr"
         WHERE "GN_bdr_ID" = $1
         FOR UPDATE`, [rowId]);
            if (baseResult.rowCount === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({ error: 'Row not found' });
                return;
            }
            await client.query(`DELETE FROM "GN_bdr_limit_calculation"
         WHERE "GN_bdr_ID_FK" = $1`, [rowId]);
            for (let index = 0; index < lines.length; index += 1) {
                const line = lines[index];
                await client.query(`INSERT INTO "GN_bdr_limit_calculation" (
             "GN_bdr_ID_FK",
             "line_order",
             "quantity",
             "tariff",
             "line_note"
           ) VALUES ($1, $2, $3, $4, $5)`, [rowId, index + 1, line.quantity, line.tariff, line.note]);
            }
            const totalByLines = lines.reduce((acc, line) => acc + line.quantity * line.tariff, 0);
            const calculatedLimit = totalByLines + unitLimit;
            const totalQuantity = lines.reduce((acc, line) => acc + line.quantity, 0);
            const comments = payload.comments === undefined
                ? String(baseResult.rows[0].comments ?? '')
                : String(payload.comments ?? '');
            await client.query(`UPDATE "GN_bdr"
         SET
           "GN_bdr_kol-vo" = $1,
           "GN_bdr_edin.limit" = $2,
           "GN_bdr_limit" = $3,
           "GN_bdr_comments" = $4
         WHERE "GN_bdr_ID" = $5`, [totalQuantity, unitLimit, calculatedLimit, comments, rowId]);
            await client.query('COMMIT');
            res.json({
                rowId,
                unitLimit,
                comments,
                lines: lines.map((line, index) => ({
                    lineOrder: index + 1,
                    quantity: line.quantity,
                    tariff: line.tariff,
                    note: line.note,
                })),
                totalByLines,
                calculatedLimit,
                storedLimit: calculatedLimit,
                difference: 0,
            });
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('Failed to save limit calculation', err);
            res.status(500).json({ error: 'Failed to save limit calculation' });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/gn/bdr/:id', async (req, res) => {
        const rowId = Number(req.params.id);
        if (Number.isNaN(rowId)) {
            res.status(400).json({ error: 'Invalid row id' });
            return;
        }
        const client = await createDbClient();
        async function resolveLookupId(query, value, entityLabel) {
            const result = await client.query(query, [value]);
            if (result.rowCount === 0) {
                throw new Error(`${entityLabel} not found`);
            }
            return result.rows[0].id;
        }
        const payload = req.body;
        const updates = [];
        try {
            await client.query('BEGIN');
            if (payload['Статья бюджета УС'] !== undefined) {
                const id = await resolveLookupId('SELECT "PAO_b_id" AS id FROM "PAO__budget_network_item" WHERE "PAO__budget_network_item" = $1 LIMIT 1', String(payload['Статья бюджета УС']), 'PAO budget item');
                updates.push({ column: 'PAO_budget_network_item_FK', value: id });
            }
            if (payload['Подразделение'] !== undefined) {
                const id = await resolveLookupId('SELECT "GN_Dep_id" AS id FROM "GN_department" WHERE "GN_department" = $1 LIMIT 1', String(payload['Подразделение']), 'Department');
                updates.push({ column: 'GN_department_FK', value: id });
            }
            if (payload['Объект'] !== undefined) {
                const id = await resolveLookupId('SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1', String(payload['Объект']), 'Object');
                updates.push({ column: 'GN_departament_object_FK', value: id });
            }
            if (payload['Договор'] !== undefined) {
                const id = await resolveLookupId('SELECT "GN_dgv_id" AS id FROM "GN_dogovor" WHERE "GN_dogovor" = $1 LIMIT 1', String(payload['Договор']), 'Dogovor');
                updates.push({ column: 'GN_dogovor_FK', value: id });
            }
            if (payload['Контрагент'] !== undefined) {
                const id = await resolveLookupId('SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1', String(payload['Контрагент']), 'Contractor');
                updates.push({ column: 'GN_contracor_FK', value: id });
            }
            if (payload['Статья бюджета'] !== undefined) {
                const id = await resolveLookupId('SELECT "GN_b_id" AS id FROM "GN_budget_network_item" WHERE "GN_budget_network_item" = $1 LIMIT 1', String(payload['Статья бюджета']), 'Budget item');
                updates.push({ column: 'GN_budget_network_item_FK', value: id });
            }
            if (payload['Предмет договора'] !== undefined) {
                updates.push({ column: 'GN_bdr_predmet_dogovora', value: String(payload['Предмет договора']) });
            }
            if (payload['Ед. изм.'] !== undefined) {
                updates.push({ column: 'GN_bdr_ed.izm', value: String(payload['Ед. изм.']) });
            }
            if (payload['Кол-во'] !== undefined) {
                const value = Number(payload['Кол-во']);
                if (Number.isNaN(value)) {
                    throw new Error('Invalid Кол-во');
                }
                updates.push({ column: 'GN_bdr_kol-vo', value });
            }
            if (payload['Лимит'] !== undefined) {
                const value = Number(payload['Лимит']);
                if (Number.isNaN(value)) {
                    throw new Error('Invalid Лимит');
                }
                updates.push({ column: 'GN_bdr_limit', value });
            }
            if (payload['БДР25корр'] !== undefined) {
                const value = payload['БДР25корр'] === '' ? null : Number(payload['БДР25корр']);
                if (value !== null && Number.isNaN(value)) {
                    throw new Error('Invalid БДР25корр');
                }
                updates.push({ column: 'GN_bdr_bdr25_corr', value });
            }
            if (payload['БДР26'] !== undefined) {
                const value = payload['БДР26'] === '' ? null : Number(payload['БДР26']);
                if (value !== null && Number.isNaN(value)) {
                    throw new Error('Invalid БДР26');
                }
                updates.push({ column: 'GN_bdr_bdr26', value });
            }
            if (payload['БДР26корр'] !== undefined) {
                const value = payload['БДР26корр'] === '' ? null : Number(payload['БДР26корр']);
                if (value !== null && Number.isNaN(value)) {
                    throw new Error('Invalid БДР26корр');
                }
                updates.push({ column: 'GN_bdr_bdr26_corr', value });
            }
            if (payload['Един. лимит'] !== undefined) {
                const value = Number(payload['Един. лимит']);
                if (Number.isNaN(value)) {
                    throw new Error('Invalid Един. лимит');
                }
                updates.push({ column: 'GN_bdr_edin.limit', value });
            }
            if (payload['Примечания'] !== undefined) {
                updates.push({ column: 'GN_bdr_comments', value: String(payload['Примечания']) });
            }
            if (updates.length === 0) {
                res.status(400).json({ error: 'No editable fields provided' });
                return;
            }
            const setClause = updates
                .map((entry, index) => `"${entry.column}" = $${index + 1}`)
                .join(', ');
            const values = updates.map((entry) => entry.value);
            const updateResult = await client.query(`UPDATE "GN_bdr"
         SET ${setClause}
         WHERE "GN_bdr_ID" = $${updates.length + 1}
         RETURNING "GN_bdr_ID"`, [...values, rowId]);
            if (updateResult.rowCount === 0) {
                await client.query('ROLLBACK');
                res.status(404).json({ error: 'Row not found' });
                return;
            }
            const result = await client.query(`${BDR_SELECT_FIELDS}
         WHERE b."GN_bdr_ID" = $1`, [rowId]);
            await client.query('COMMIT');
            res.json(result.rows[0]);
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('Failed to update GN_bdr row', err);
            if (err instanceof Error && (err.message.includes('not found') || err.message.includes('Invalid'))) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.status(500).json({ error: 'Failed to update GN_bdr row' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/gn/:entity', async (req, res) => {
        const { entity } = req.params;
        const config = GN_TABLE_CONFIGS[entity];
        if (!config) {
            res.status(404).json({ error: 'Unknown GN entity' });
            return;
        }
        const fields = config.editableColumns.filter((column) => req.body[column] !== undefined);
        if (fields.length === 0) {
            res.status(400).json({ error: 'No fields provided for creation' });
            return;
        }
        const values = fields.map((column) => {
            if (column.endsWith('_FK')) {
                if (req.body[column] === null)
                    return null;
                const numericValue = Number(req.body[column]);
                if (Number.isNaN(numericValue)) {
                    throw new Error(`Invalid value for ${column}`);
                }
                return numericValue;
            }
            if (config.numericColumns?.includes(column)) {
                if (req.body[column] === null || req.body[column] === '')
                    return null;
                const numericValue = Number(req.body[column]);
                if (Number.isNaN(numericValue)) {
                    throw new Error(`Invalid value for ${column}`);
                }
                return numericValue;
            }
            return req.body[column];
        });
        const client = await createDbClient();
        try {
            const result = await client.query(`INSERT INTO "${config.tableName}" (${fields.map((column) => `"${column}"`).join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`, values);
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to create GN entity row' });
        }
        finally {
            await client.end();
        }
    });
    app.delete('/api/gn/:entity/:id', async (req, res) => {
        const { entity, id } = req.params;
        const config = GN_TABLE_CONFIGS[entity];
        if (!config) {
            res.status(404).json({ error: 'Unknown GN entity' });
            return;
        }
        const rowId = Number(id);
        if (Number.isNaN(rowId)) {
            res.status(400).json({ error: 'Invalid row id' });
            return;
        }
        const client = await createDbClient();
        try {
            const result = await client.query(`DELETE FROM "${config.tableName}" WHERE "${config.idColumn}" = $1`, [rowId]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Row not found' });
                return;
            }
            res.json({ success: true });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete GN entity row' });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/gn/:entity/:id', async (req, res) => {
        const { entity, id } = req.params;
        const config = GN_TABLE_CONFIGS[entity];
        if (!config) {
            res.status(404).json({ error: 'Unknown GN entity' });
            return;
        }
        const rowId = Number(id);
        if (Number.isNaN(rowId)) {
            res.status(400).json({ error: 'Invalid row id' });
            return;
        }
        const updates = config.editableColumns.filter((column) => req.body[column] !== undefined);
        if (updates.length === 0) {
            res.status(400).json({ error: 'No editable fields provided' });
            return;
        }
        const setClause = updates
            .map((column, index) => `"${column}" = $${index + 1}`)
            .join(', ');
        const values = updates.map((column) => {
            if (column.endsWith('_FK')) {
                const numericValue = Number(req.body[column]);
                if (Number.isNaN(numericValue)) {
                    throw new Error(`Invalid value for ${column}`);
                }
                return numericValue;
            }
            if (config.numericColumns?.includes(column)) {
                if (req.body[column] === null || req.body[column] === '')
                    return null;
                const numericValue = Number(req.body[column]);
                if (Number.isNaN(numericValue)) {
                    throw new Error(`Invalid value for ${column}`);
                }
                return numericValue;
            }
            return req.body[column];
        });
        const client = await createDbClient();
        try {
            const result = await client.query(`UPDATE "${config.tableName}"
         SET ${setClause}
         WHERE "${config.idColumn}" = $${updates.length + 1}
         RETURNING *`, [...values, rowId]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Row not found' });
                return;
            }
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error('Failed to update GN entity row', err);
            if (err instanceof Error && err.message.includes('Invalid value')) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.status(500).json({ error: 'Failed to update GN entity row' });
        }
        finally {
            await client.end();
        }
    });
    app.get('/api/gn/bdr', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`${BDR_SELECT_FIELDS}
        ORDER BY b."GN_bdr_ID" ASC`);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch GN_bdr' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/gn/bdr', async (req, res) => {
        const { pao_budget_item, department, object_name, dogovor, contractor, budget_item, predmet_dogovora, ed_izm, kol_vo, limit, bdr25_corr, bdr26, bdr26_corr, edin_limit, comments, } = req.body;
        if (!pao_budget_item ||
            !department ||
            !object_name ||
            !dogovor ||
            !contractor ||
            !budget_item ||
            !predmet_dogovora ||
            !ed_izm ||
            kol_vo == null ||
            limit == null ||
            edin_limit == null) {
            res.status(400).json({ error: 'Invalid payload' });
            return;
        }
        const kolVoNumber = Number(kol_vo);
        const limitNumber = Number(limit);
        const bdr25CorrNumber = bdr25_corr == null || bdr25_corr === '' ? null : Number(bdr25_corr);
        const bdr26Number = bdr26 == null || bdr26 === '' ? null : Number(bdr26);
        const bdr26CorrNumber = bdr26_corr == null || bdr26_corr === '' ? null : Number(bdr26_corr);
        const edinLimitNumber = Number(edin_limit);
        if (Number.isNaN(kolVoNumber) ||
            Number.isNaN(limitNumber) ||
            (bdr25CorrNumber !== null && Number.isNaN(bdr25CorrNumber)) ||
            (bdr26Number !== null && Number.isNaN(bdr26Number)) ||
            (bdr26CorrNumber !== null && Number.isNaN(bdr26CorrNumber)) ||
            Number.isNaN(edinLimitNumber)) {
            res.status(400).json({ error: 'Numeric fields are invalid' });
            return;
        }
        const client = await createDbClient();
        async function getIdByName(query, value, entityLabel) {
            const result = await client.query(query, [value]);
            if (result.rowCount === 0) {
                throw new Error(`${entityLabel} not found`);
            }
            return result.rows[0].id;
        }
        try {
            await client.query('BEGIN');
            const paoId = await getIdByName('SELECT "PAO_b_id" AS id FROM "PAO__budget_network_item" WHERE "PAO__budget_network_item" = $1 LIMIT 1', pao_budget_item, 'PAO budget item');
            const departmentId = await getIdByName('SELECT "GN_Dep_id" AS id FROM "GN_department" WHERE "GN_department" = $1 LIMIT 1', department, 'Department');
            const objectId = await getIdByName('SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1', object_name, 'Object');
            const dogovorId = await getIdByName('SELECT "GN_dgv_id" AS id FROM "GN_dogovor" WHERE "GN_dogovor" = $1 LIMIT 1', dogovor, 'Dogovor');
            const contractorId = await getIdByName('SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1', contractor, 'Contractor');
            const budgetItemId = await getIdByName('SELECT "GN_b_id" AS id FROM "GN_budget_network_item" WHERE "GN_budget_network_item" = $1 LIMIT 1', budget_item, 'Budget item');
            const insertResult = await client.query(`INSERT INTO "GN_bdr" (
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
           "GN_bdr_bdr25_corr",
           "GN_bdr_bdr26",
           "GN_bdr_bdr26_corr",
           "GN_bdr_edin.limit",
           "GN_bdr_comments"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING "GN_bdr_ID" AS id`, [
                paoId,
                departmentId,
                objectId,
                dogovorId,
                contractorId,
                budgetItemId,
                predmet_dogovora,
                ed_izm,
                kolVoNumber,
                limitNumber,
                bdr25CorrNumber,
                bdr26Number,
                bdr26CorrNumber,
                edinLimitNumber,
                comments ?? '',
            ]);
            const newBdrId = insertResult.rows[0].id;
            const createdRow = await client.query(`${BDR_SELECT_FIELDS}
         WHERE b."GN_bdr_ID" = $1`, [newBdrId]);
            await client.query('COMMIT');
            res.status(201).json(createdRow.rows[0]);
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('Failed to create GN_bdr row', err);
            if (err instanceof Error && err.message.includes('not found')) {
                res.status(400).json({ error: err.message });
                return;
            }
            res.status(500).json({ error: 'Failed to create GN_bdr row' });
        }
        finally {
            await client.end();
        }
    });
    // Импортозамещение endpoints
    app.get('/api/gn/import-substitution', async (req, res) => {
        const client = await createDbClient();
        try {
            const result = await client.query(`SELECT
           "GN_import_substitution_id",
           "Подразделение",
           "Процент исполнения",
           okdp."GN_invest_okdp_tko_is_prit" AS "Код ТКО",
           i."Наименование ТКО",
           vendor."GN_equipment_manufacturer" AS "Вендор ТКО",
           i."Классификация ТКО",
           i."ЕРРП",
           i."ЕРМТР",
           i."Регистрационный номер ТКО",
           i."Количество",
           i."Замещенное импортное ТКО",
           i."Кол-во выводенного импортного ТКО",
           i."Статья затрат ТКО",
           i."Платеж ТР без НДС",
           i."Год",
           i."Примечание"
         FROM "GN_import_substitution" i
         LEFT JOIN "GN_invest_okdp_tko_is_prit" okdp ON i."GN_import_substitution_okdp_fk" = okdp."GN_invest_okdp_tko_is_prit_id"
         LEFT JOIN "GN_equipment_manufacturer" vendor ON i."GN_import_substitution_vendor_fk" = vendor."GN_equipment_manufacturer_id"
         ORDER BY "Подразделение" ASC`);
            res.json(result.rows);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch import-substitution data' });
        }
        finally {
            await client.end();
        }
    });
    app.put('/api/gn/import-substitution/:id', async (req, res) => {
        const { id } = req.params;
        const { 'Подразделение': department, 'Процент исполнения': percentage, 'Код ТКО': okdpCode, 'Наименование ТКО': tkoName, 'Вендор ТКО': vendorName, 'Классификация ТКО': classification, 'ЕРРП': errp, 'ЕРМТР': ermtr, 'Регистрационный номер ТКО': registrationNumber, 'Количество': quantity, 'Замещенное импортное ТКО': replacedImportTko, 'Кол-во выводенного импортного ТКО': decommissionedQuantity, 'Статья затрат ТКО': costItem, 'Платеж ТР без НДС': paymentWithoutVat, 'Год': year, 'Примечание': note, } = req.body;
        const rowId = Number(id);
        if (Number.isNaN(rowId)) {
            res.status(400).json({ error: 'Invalid row id' });
            return;
        }
        if (!department || percentage === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const percentageNumber = Number(percentage);
        if (!Number.isFinite(percentageNumber) || percentageNumber < 0 || percentageNumber > 100) {
            res.status(400).json({ error: 'Percentage must be a number between 0 and 100' });
            return;
        }
        if (classification && !['Импорт', 'РФ в реестре', 'РФ НЕ в реестре'].includes(classification)) {
            res.status(400).json({ error: 'Некорректная классификация ТКО' });
            return;
        }
        if (![undefined, 'ДА', 'НЕТ'].includes(errp) || ![undefined, 'ДА', 'НЕТ'].includes(ermtr)) {
            res.status(400).json({ error: 'ЕРРП и ЕРМТР могут принимать только значения ДА или НЕТ' });
            return;
        }
        if (costItem && !['ОНМ', 'ПЭН'].includes(costItem)) {
            res.status(400).json({ error: 'Некорректная статья затрат ТКО' });
            return;
        }
        const client = await createDbClient();
        try {
            const resolveId = async (query, value) => {
                const normalized = String(value ?? '').trim();
                if (!normalized)
                    return null;
                const lookup = await client.query(query, [normalized]);
                if (lookup.rowCount === 0)
                    throw new Error('Значение не найдено в справочнике');
                return lookup.rows[0].id;
            };
            const okdpId = await resolveId('SELECT "GN_invest_okdp_tko_is_prit_id" AS id FROM "GN_invest_okdp_tko_is_prit" WHERE "GN_invest_okdp_tko_is_prit" = $1 LIMIT 1', okdpCode);
            const vendorId = await resolveId('SELECT "GN_equipment_manufacturer_id" AS id FROM "GN_equipment_manufacturer" WHERE "GN_equipment_manufacturer" = $1 LIMIT 1', vendorName);
            const result = await client.query(`UPDATE "GN_import_substitution"
         SET "Подразделение" = $1, "Процент исполнения" = $2, "GN_import_substitution_okdp_fk" = $3,
             "Наименование ТКО" = $4, "GN_import_substitution_vendor_fk" = $5, "Классификация ТКО" = $6,
             "ЕРРП" = $7, "ЕРМТР" = $8, "Регистрационный номер ТКО" = $9, "Количество" = $10,
             "Замещенное импортное ТКО" = $11, "Кол-во выводенного импортного ТКО" = $12,
             "Статья затрат ТКО" = $13, "Платеж ТР без НДС" = $14, "Год" = $15, "Примечание" = $16, "updated_at" = NOW()
         WHERE "GN_import_substitution_id" = $17
         RETURNING *`, [department, percentageNumber, okdpId, tkoName || null, vendorId, classification || null, errp || 'НЕТ', ermtr || 'НЕТ', registrationNumber || null, quantity === '' || quantity == null ? null : Number(quantity), replacedImportTko || null, decommissionedQuantity === '' || decommissionedQuantity == null ? null : Number(decommissionedQuantity), costItem || 'ПЭН', paymentWithoutVat === '' || paymentWithoutVat == null ? null : Number(paymentWithoutVat), year === '' || year == null ? null : Number(year), note || null, rowId]);
            if (result.rowCount === 0) {
                res.status(404).json({ error: 'Row not found' });
                return;
            }
            res.json(result.rows[0]);
        }
        catch (err) {
            console.error(err);
            res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update import-substitution data' });
        }
        finally {
            await client.end();
        }
    });
    app.post('/api/gn/import-substitution', async (req, res) => {
        const { 'Подразделение': department, 'Процент исполнения': percentage, 'Код ТКО': okdpCode, 'Наименование ТКО': tkoName, 'Вендор ТКО': vendorName, 'Классификация ТКО': classification, 'ЕРРП': errp = 'НЕТ', 'ЕРМТР': ermtr = 'НЕТ', 'Регистрационный номер ТКО': registrationNumber, 'Количество': quantity, 'Замещенное импортное ТКО': replacedImportTko, 'Кол-во выводенного импортного ТКО': decommissionedQuantity, 'Статья затрат ТКО': costItem = 'ПЭН', 'Платеж ТР без НДС': paymentWithoutVat, 'Год': year, 'Примечание': note, } = req.body;
        if (!department || percentage === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const percentageNumber = Number(percentage);
        if (!Number.isFinite(percentageNumber) || percentageNumber < 0 || percentageNumber > 100) {
            res.status(400).json({ error: 'Percentage must be a number between 0 and 100' });
            return;
        }
        if (classification && !['Импорт', 'РФ в реестре', 'РФ НЕ в реестре'].includes(classification)) {
            res.status(400).json({ error: 'Некорректная классификация ТКО' });
            return;
        }
        if (!['ДА', 'НЕТ'].includes(errp) || !['ДА', 'НЕТ'].includes(ermtr)) {
            res.status(400).json({ error: 'ЕРРП и ЕРМТР могут принимать только значения ДА или НЕТ' });
            return;
        }
        if (!['ОНМ', 'ПЭН'].includes(costItem)) {
            res.status(400).json({ error: 'Некорректная статья затрат ТКО' });
            return;
        }
        const client = await createDbClient();
        try {
            const resolveId = async (query, value) => {
                const normalized = String(value ?? '').trim();
                if (!normalized)
                    return null;
                const lookup = await client.query(query, [normalized]);
                if (lookup.rowCount === 0)
                    throw new Error('Значение не найдено в справочнике');
                return lookup.rows[0].id;
            };
            const okdpId = await resolveId('SELECT "GN_invest_okdp_tko_is_prit_id" AS id FROM "GN_invest_okdp_tko_is_prit" WHERE "GN_invest_okdp_tko_is_prit" = $1 LIMIT 1', okdpCode);
            const vendorId = await resolveId('SELECT "GN_equipment_manufacturer_id" AS id FROM "GN_equipment_manufacturer" WHERE "GN_equipment_manufacturer" = $1 LIMIT 1', vendorName);
            const result = await client.query(`INSERT INTO "GN_import_substitution" (
           "Подразделение", "Процент исполнения", "GN_import_substitution_okdp_fk", "Наименование ТКО", "GN_import_substitution_vendor_fk", "Классификация ТКО", "ЕРРП", "ЕРМТР", "Регистрационный номер ТКО", "Количество", "Замещенное импортное ТКО", "Кол-во выводенного импортного ТКО", "Статья затрат ТКО", "Платеж ТР без НДС", "Год", "Примечание"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`, [department, percentageNumber, okdpId, tkoName || null, vendorId, classification || null, errp, ermtr, registrationNumber || null, quantity === '' || quantity == null ? null : Number(quantity), replacedImportTko || null, decommissionedQuantity === '' || decommissionedQuantity == null ? null : Number(decommissionedQuantity), costItem, paymentWithoutVat === '' || paymentWithoutVat == null ? null : Number(paymentWithoutVat), year === '' || year == null ? null : Number(year), note || null]);
            res.status(201).json(result.rows[0]);
        }
        catch (err) {
            console.error(err);
            res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create import-substitution data' });
        }
        finally {
            await client.end();
        }
    });
}
//# sourceMappingURL=routes.js.map