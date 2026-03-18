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

app.get('/api/health', (req: Request, res: Response): void => {
  res.json({ status: 'ok' });
});

async function start(): Promise<void> {
  const client = await createDbClient();
  try {
    await ensureBudgetTable(client);
  } catch (err) {
    console.error('Error ensuring budget table exists', err);
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
