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

async function ensureBudgetTable(client: Client): Promise<void> {
  await client.query(`
    DROP TABLE IF EXISTS service_budget CASCADE;
    CREATE TABLE service_budget (
      id SERIAL PRIMARY KEY,
      service_name TEXT NOT NULL,
      category TEXT NOT NULL,
      monthly_cost NUMERIC NOT NULL,
      consumption TEXT,
      contract_date DATE,
      renewal_date DATE,
      provider TEXT,
      status TEXT,
      discount_percent NUMERIC DEFAULT 0,
      notes TEXT
    );
  `);

  const result: QueryResult<{ count: number }> = await client.query(
    'SELECT COUNT(*)::int AS count FROM service_budget'
  );
  const count = result.rows[0]?.count ?? 0;

  if (count === 0) {
    const seed = [
      {
        service_name: 'Мобильный интернет 10 ГБ',
        category: 'Интернет',
        monthly_cost: 400,
        consumption: '10 GB/месяц',
        contract_date: '2024-01-15',
        renewal_date: '2025-01-15',
        provider: 'МегаФон',
        status: 'Активна',
        discount_percent: 5,
        notes: 'Базовый тариф для сотрудников',
      },
      {
        service_name: 'Фиксированный интернет 100 Мбит',
        category: 'Интернет',
        monthly_cost: 650,
        consumption: 'Безлимит',
        contract_date: '2024-02-01',
        renewal_date: '2025-02-01',
        provider: 'Ростелеком',
        status: 'Активна',
        discount_percent: 10,
        notes: 'Оплата по договору',
      },
      {
        service_name: 'Корпоративные звонки (безлимит)',
        category: 'Телефония',
        monthly_cost: 950,
        consumption: 'Безлимит',
        contract_date: '2024-03-01',
        renewal_date: '2025-03-01',
        provider: 'Билайн',
        status: 'Активна',
        discount_percent: 0,
        notes: 'Пакет для менеджеров продаж',
      },
      {
        service_name: 'SMS-пакет 500',
        category: 'Текстовые сообщения',
        monthly_cost: 120,
        consumption: '500 SMS/месяц',
        contract_date: '2024-01-10',
        renewal_date: '2025-01-10',
        provider: 'Ростелеком',
        status: 'Активна',
        discount_percent: 3,
        notes: 'Для уведомлений клиентов',
      },
      {
        service_name: 'VPN-доступ',
        category: 'Безопасность',
        monthly_cost: 300,
        consumption: 'Безлимит',
        contract_date: '2024-05-01',
        renewal_date: '2025-05-01',
        provider: 'NordVPN',
        status: 'Активна',
        discount_percent: 15,
        notes: 'Защищённый доступ к внутренним ресурсам',
      },
      {
        service_name: 'Облачный колл-центр',
        category: 'Телефония',
        monthly_cost: 2200,
        consumption: '1000 минут',
        contract_date: '2023-12-01',
        renewal_date: '2024-12-01',
        provider: 'IQVIA',
        status: 'Активна',
        discount_percent: 20,
        notes: 'Используется отделом поддержки',
      },
      {
        service_name: 'Дополнительный IP-адрес',
        category: 'Сеть',
        monthly_cost: 150,
        consumption: '10 адресов',
        contract_date: '2024-04-01',
        renewal_date: '2025-04-01',
        provider: 'QWEST',
        status: 'Активна',
        discount_percent: 0,
        notes: 'Для внешних сервисов и мониторинга',
      },
      {
        service_name: 'Широкополосный доступ 1 Гбит',
        category: 'Интернет',
        monthly_cost: 4200,
        consumption: 'Безлимит',
        contract_date: '2024-01-01',
        renewal_date: '2025-01-01',
        provider: 'ТТК',
        status: 'Активна',
        discount_percent: 12,
        notes: 'Стабильное подключение для инфраструктуры',
      },
      {
        service_name: 'Тариф на видеосвязь',
        category: 'Видеоконференции',
        monthly_cost: 800,
        consumption: '50 часов',
        contract_date: '2024-06-01',
        renewal_date: '2025-06-01',
        provider: 'Zoom',
        status: 'Активна',
        discount_percent: 8,
        notes: 'Для собраний и онлайн-тренингов',
      },
      {
        service_name: 'Международный роуминг',
        category: 'Мобильная связь',
        monthly_cost: 990,
        consumption: 'Безлимит',
        contract_date: '2024-02-15',
        renewal_date: '2025-02-15',
        provider: 'МегаФон',
        status: 'Активна',
        discount_percent: 7,
        notes: 'Пакет для поездок сотрудников за рубеж',
      },
      {
        service_name: '5G мобильный интернет',
        category: 'Интернет',
        monthly_cost: 550,
        consumption: '20 GB/месяц',
        contract_date: '2024-07-01',
        renewal_date: '2025-07-01',
        provider: 'Билайн',
        status: 'Активна',
        discount_percent: 5,
        notes: 'Высокоскоростное соединение',
      },
      {
        service_name: 'Облачное хранилище 2 ТБ',
        category: 'IT-сервисы',
        monthly_cost: 450,
        consumption: '2 TB',
        contract_date: '2024-03-15',
        renewal_date: '2025-03-15',
        provider: 'Яндекс',
        status: 'Активна',
        discount_percent: 10,
        notes: 'Резервная копия данных компании',
      },
      {
        service_name: 'Гибридная АТС',
        category: 'Телефония',
        monthly_cost: 1800,
        consumption: '200 портов',
        contract_date: '2024-01-20',
        renewal_date: '2025-01-20',
        provider: 'Ростелеком',
        status: 'Активна',
        discount_percent: 15,
        notes: 'Центральная телефонная станция',
      },
      {
        service_name: 'Домен .ru',
        category: 'Интернет',
        monthly_cost: 99,
        consumption: '1 домен',
        contract_date: '2024-08-01',
        renewal_date: '2025-08-01',
        provider: 'Reg.ru',
        status: 'Активна',
        discount_percent: 0,
        notes: 'Ежегодная регистрация',
      },
      {
        service_name: 'SSL сертификат',
        category: 'Безопасность',
        monthly_cost: 200,
        consumption: '5 certify',
        contract_date: '2024-04-10',
        renewal_date: '2025-04-10',
        provider: 'Let\'s Encrypt',
        status: 'Активна',
        discount_percent: 25,
        notes: 'Шифрование веб-приложений',
      },
      {
        service_name: 'Резервные каналы доступа',
        category: 'Сеть',
        monthly_cost: 3500,
        consumption: '2 канала',
        contract_date: '2024-05-15',
        renewal_date: '2025-05-15',
        provider: 'МегаФон',
        status: 'Активна',
        discount_percent: 18,
        notes: 'На случай отказа основного канала',
      },
      {
        service_name: 'Мониторинг ИТ-инфраструктуры',
        category: 'IT-сервисы',
        monthly_cost: 1200,
        consumption: '24/7',
        contract_date: '2024-02-20',
        renewal_date: '2025-02-20',
        provider: 'NMS',
        status: 'Активна',
        discount_percent: 20,
        notes: 'Контроль серверов и сетей',
      },
      {
        service_name: 'IP-телефоны (20 шт)',
        category: 'Оборудование',
        monthly_cost: 800,
        consumption: '20 шт',
        contract_date: '2024-06-10',
        renewal_date: '2025-06-10',
        provider: 'Cisco',
        status: 'Активна',
        discount_percent: 12,
        notes: 'VoIP телефоны для офиса',
      },
      {
        service_name: 'Лицензия Microsoft 365',
        category: 'ПО',
        monthly_cost: 3200,
        consumption: '50 мест',
        contract_date: '2024-01-01',
        renewal_date: '2025-01-01',
        provider: 'Microsoft',
        status: 'Активна',
        discount_percent: 22,
        notes: 'Продуктивность и сотрудничество',
      },
      {
        service_name: 'Резервная мобильная SIM',
        category: 'Мобильная связь',
        monthly_cost: 180,
        consumption: '5 GB/месяц',
        contract_date: '2024-07-10',
        renewal_date: '2025-07-10',
        provider: 'Tele2',
        status: 'Пассивна',
        discount_percent: 0,
        notes: 'Для чрезвычайных ситуаций',
      },
    ];

    const insertQuery = `
      INSERT INTO service_budget (service_name, category, monthly_cost, consumption, contract_date, renewal_date, provider, status, discount_percent, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    for (const row of seed) {
      await client.query(insertQuery, [
        row.service_name,
        row.category,
        row.monthly_cost,
        row.consumption,
        row.contract_date,
        row.renewal_date,
        row.provider,
        row.status,
        row.discount_percent,
        row.notes,
      ]);
    }

    console.log('✅ Seeded service_budget table with sample data (20 rows).');
  }
}

async function ensureOrdersCustomersTables(client: Client): Promise<void> {
  await client.query(`
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;

    CREATE TABLE customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT
    );

    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL REFERENCES customers(id),
      order_date DATE NOT NULL,
      amount NUMERIC NOT NULL,
      status TEXT NOT NULL
    );
  `);

  const custCount = await client.query('SELECT COUNT(*)::int AS count FROM customers');
  const orderCount = await client.query('SELECT COUNT(*)::int AS count FROM orders');

  if ((custCount.rows[0]?.count ?? 0) === 0 && (orderCount.rows[0]?.count ?? 0) === 0) {
    const customers = [
      { name: 'Иван Иванов', email: 'ivan@example.com', phone: '+7 (910) 123-45-67', address: 'Москва, ул. Ленина, 1' },
      { name: 'Мария Петрова', email: 'maria@example.com', phone: '+7 (911) 234-56-78', address: 'Санкт-Петербург, Невский пр., 20' },
      { name: 'Олег Смирнов', email: 'oleg@example.com', phone: '+7 (912) 345-67-89', address: 'Казань, ул. Пушкина, 5' },
    ];

    for (const c of customers) {
      await client.query(
        'INSERT INTO customers (name, email, phone, address) VALUES ($1, $2, $3, $4)',
        [c.name, c.email, c.phone, c.address]
      );
    }

    const orders = [
      { customer_id: 1, order_date: '2025-02-10', amount: 150000, status: 'Создан' },
      { customer_id: 2, order_date: '2025-03-01', amount: 54000, status: 'Выполнен' },
      { customer_id: 3, order_date: '2025-01-15', amount: 220000, status: 'Отменен' },
    ];

    for (const o of orders) {
      await client.query(
        'INSERT INTO orders (customer_id, order_date, amount, status) VALUES ($1, $2, $3, $4)',
        [o.customer_id, o.order_date, o.amount, o.status]
      );
    }

    console.log('✅ Seeded customers and orders tables');
  }
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

app.get('/api/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

async function start(): Promise<void> {
  const client = await createDbClient();
  try {
    await ensureBudgetTable(client);
    await ensureOrdersCustomersTables(client);
  } catch (err) {
    console.error('Error ensuring database tables exist', err);
    process.exit(1);
  } finally {
    await client.end();
  }

  app.listen(PORT, () => {
    console.log(`🚀 Backend listening at http://localhost:${PORT}`);
  });
}

start().catch((err: unknown) => {
  console.error('Unexpected error starting server', err);
  process.exit(1);
});
