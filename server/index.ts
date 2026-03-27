import 'dotenv/config';
import express, { Express, Request, Response } from 'express';
import { Client, QueryResult } from 'pg';

const PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 4000;

const app: Express = express();

// Use JSON payloads if needed later
app.use(express.json());

interface ServiceBudgetRow {
  id: number;
  service_name: string;
  category: string;
  monthly_cost: number;
  consumption: string;
  contract_date: string;
  renewal_date: string;
  provider: string;
  status: string;
  discount_percent: number;
  notes: string;
}

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface OrderRow {
  id: number;
  customer_id: number;
  order_date: string;
  amount: number;
  status: string;
}

interface OrderCustomerRow {
  order_id: number;
  order_date: string;
  amount: number;
  order_status: string;
  customer_id: number;
  customer_name: string;
  email: string;
  phone: string;
  address: string;
}

async function createDbClient(): Promise<Client> {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'postgres',
  });
  await client.connect();
  return client;
}

app.get('/api/budget', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result: QueryResult<ServiceBudgetRow> = await client.query(
      'SELECT id, service_name, category, monthly_cost, consumption, contract_date, renewal_date, provider, status, discount_percent, notes FROM service_budget ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch budget rows', err);
    res.status(500).json({ error: 'Failed to fetch budget data' });
  } finally {
    await client.end();
  }
});

app.get('/api/guide-data', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result: QueryResult<OrderCustomerRow> = await client.query(
      `SELECT
         o.id AS order_id,
         o.order_date,
         o.amount,
         o.status AS order_status,
         c.id AS customer_id,
         c.name AS customer_name,
         c.email,
         c.phone,
         c.address
       FROM orders o
       JOIN customers c ON o.customer_id = c.id
       ORDER BY o.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Failed to fetch guide data', err);
    res.status(500).json({ error: 'Failed to fetch guide data' });
  } finally {
    await client.end();
  }
});

app.post('/api/guide-data', async (req: Request, res: Response): Promise<void> => {
  const {
    order_date,
    amount,
    order_status,
    customer_name,
    email,
    phone,
    address,
  } = req.body;

  if (!order_date || amount == null || !order_status || !customer_name || !email) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const client = await createDbClient();
  try {
    await client.query('BEGIN');

    const customerInsert = await client.query(
      'INSERT INTO customers (name, email, phone, address) VALUES ($1, $2, $3, $4) RETURNING id',
      [customer_name, email, phone, address]
    );
    const customerId = customerInsert.rows[0].id;

    const orderInsert = await client.query(
      'INSERT INTO orders (customer_id, order_date, amount, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [customerId, order_date, amount, order_status]
    );

    const orderId = orderInsert.rows[0].id;

    await client.query('COMMIT');

    res.status(201).json({
      order_id: orderId,
      order_date,
      amount,
      order_status,
      customer_id: customerId,
      customer_name,
      email,
      phone,
      address,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to create guide data', err);
    res.status(500).json({ error: 'Failed to create guide data' });
  } finally {
    await client.end();
  }
});

app.put('/api/guide-data/:orderId', async (req: Request, res: Response): Promise<void> => {
  const orderId = Number(req.params.orderId);
  const {
    order_date,
    amount,
    order_status,
    customer_id,
    customer_name,
    email,
    phone,
    address,
  } = req.body;

  if (Number.isNaN(orderId) || !order_date || amount == null || !order_status || !customer_id) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  const client = await createDbClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE customers SET name = $1, email = $2, phone = $3, address = $4 WHERE id = $5',
      [customer_name, email, phone, address, customer_id]
    );

    await client.query(
      'UPDATE orders SET order_date = $1, amount = $2, status = $3 WHERE id = $4',
      [order_date, amount, order_status, orderId]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to update guide data', err);
    res.status(500).json({ error: 'Failed to update guide data' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/departments', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_department" ORDER BY "GN_Dep_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_department' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/budget-items', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_budget_network_item" ORDER BY "GN_b_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_budget_network_item' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/pao-budget-items', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "PAO__budget_network_item" ORDER BY "PAO_b_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch PAO__budget_network_item' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/contractors', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_contractor" ORDER BY "GN_c_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_contractor' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/dogovors', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_dogovor" ORDER BY "GN_dgv_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_dogovor' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/objects', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query('SELECT * FROM "GN_departament_object" ORDER BY "GN_do_id" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_departament_object' });
  } finally {
    await client.end();
  }
});

app.get('/api/gn/bdr', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result = await client.query(`
      SELECT
        b."GN_bdr_ID",
        pao."PAO__budget_network_item"    AS "Статья бюджета УС",
        dep."GN_department"               AS "Подразделение",
        obj."GN_departament_object"       AS "Объект",
        dgv."GN_dogovor"                  AS "Договор",
        cnt."GN_contarctor"               AS "Контрагент",
        bni."GN_budget_network_item"      AS "Статья бюджета",
        b."GN_bdr_predmet_dogovora"       AS "Предмет договора",
        b."GN_bdr_ed.izm"                 AS "Ед. изм.",
        b."GN_bdr_kol-vo"                 AS "Кол-во",
        b."GN_bdr_limit"                  AS "Лимит",
        b."GN_bdr_edin.limit"             AS "Един. лимит",
        b."GN_bdr_comments"               AS "Примечания"
      FROM "GN_bdr" b
      JOIN "PAO__budget_network_item" pao ON b."PAO_budget_network_item_FK" = pao."PAO_b_id"
      JOIN "GN_department"            dep ON b."GN_department_FK"           = dep."GN_Dep_id"
      JOIN "GN_departament_object"    obj ON b."GN_departament_object_FK"   = obj."GN_do_id"
      JOIN "GN_dogovor"               dgv ON b."GN_dogovor_FK"              = dgv."GN_dgv_id"
      JOIN "GN_contractor"            cnt ON b."GN_contracor_FK"            = cnt."GN_c_id"
      JOIN "GN_budget_network_item"   bni ON b."GN_budget_network_item_FK"  = bni."GN_b_id"
      ORDER BY b."GN_bdr_ID" ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch GN_bdr' });
  } finally {
    await client.end();
  }
});

app.get('/api/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

async function start(): Promise<void> {
  app.listen(PORT, () => {
    console.log(`🚀 Backend listening at http://localhost:${PORT}`);
  });
}

start().catch((err: unknown) => {
  console.error('Unexpected error starting server', err);
  process.exit(1);
});
