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
    CREATE TABLE IF NOT EXISTS service_budget (
      id SERIAL PRIMARY KEY,
      service_name TEXT NOT NULL,
      category TEXT NOT NULL,
      monthly_cost NUMERIC NOT NULL,
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
        notes: 'Базовый тариф для сотрудников в полевых условиях',
      },
      {
        service_name: 'Фиксированный тариф (домашний)',
        category: 'Интернет',
        monthly_cost: 650,
        notes: 'Оплата по договору с фиксированной скоростью 100 Мбит/с',
      },
      {
        service_name: 'Корпоративные звонки (безлимит)',
        category: 'Телефония',
        monthly_cost: 950,
        notes: 'Пакет для менеджеров продаж',
      },
      {
        service_name: 'SMS-пакет 500',
        category: 'Текстовые сообщения',
        monthly_cost: 120,
        notes: 'Для уведомлений клиентов',
      },
      {
        service_name: 'VPN-доступ',
        category: 'Безопасность',
        monthly_cost: 300,
        notes: 'Защищённый доступ к внутренним ресурсам',
      },
      {
        service_name: 'Облачный колл-центр',
        category: 'Телефония',
        monthly_cost: 2200,
        notes: 'Используется отделом поддержки',
      },
      {
        service_name: 'Дополнительный IP-адрес',
        category: 'Сеть',
        monthly_cost: 150,
        notes: 'Для внешних сервисов и мониторинга',
      },
      {
        service_name: 'Широкополосный доступ 1 Гбит',
        category: 'Интернет',
        monthly_cost: 4200,
        notes: 'Стабильное подключение для офисной инфраструктуры',
      },
      {
        service_name: 'Тариф на видеосвязь',
        category: 'Видеоконференции',
        monthly_cost: 800,
        notes: 'Для собраний и онлайн-тренингов',
      },
      {
        service_name: 'Международный роуминг',
        category: 'Мобильная связь',
        monthly_cost: 990,
        notes: 'Пакет для поездок сотрудников за рубеж',
      },
    ];

    const insertQuery = `
      INSERT INTO service_budget (service_name, category, monthly_cost, notes)
      VALUES ($1, $2, $3, $4)
    `;

    for (const row of seed) {
      await client.query(insertQuery, [
        row.service_name,
        row.category,
        row.monthly_cost,
        row.notes,
      ]);
    }

    console.log('✅ Seeded service_budget table with sample data (10 rows).');
  }
}

app.get('/api/budget', async (req: Request, res: Response): Promise<void> => {
  const client = await createDbClient();
  try {
    const result: QueryResult<ServiceBudgetRow> = await client.query(
      'SELECT id, service_name, category, monthly_cost, notes FROM service_budget ORDER BY id ASC'
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
