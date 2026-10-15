import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  createReservation,
  checkAvailability,
  confirmReservation,
  cancelReservation,
  decideReservation,
  expirePendingReservations,
} from './service';
import { pool } from './db';

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Pomocná funkce pro získání času (podporuje override přes hlavičku x-current-time pro testy)
function getEffectiveTime(req: Request): Date {
  const headerTime = req.headers['x-current-time'];
  if (typeof headerTime === 'string') {
    const parsed = new Date(headerTime);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

// --------------------------------------------------------------------------
// GET /api/hamsters — Seznam křečků
// --------------------------------------------------------------------------
app.get('/api/hamsters', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM hamsters ORDER BY name ASC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// OP-02: GET /api/reservations/availability — Zkontrolovat dostupnost
// --------------------------------------------------------------------------
app.get('/api/reservations/availability', async (req: Request, res: Response) => {
  try {
    const hamsterId = req.query.hamster_id as string;
    const startTimeStr = req.query.start_time as string;
    const endTimeStr = req.query.end_time as string;

    if (!hamsterId || !startTimeStr || !endTimeStr) {
      return res.status(400).json({ error: 'Chybí povinné parametry: hamster_id, start_time, end_time.' });
    }

    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);

    const result = await checkAvailability(hamsterId, start, end);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// OP-01: POST /api/reservations — Vytvořit rezervaci (DRAFT)
// --------------------------------------------------------------------------
app.post('/api/reservations', async (req: Request, res: Response) => {
  try {
    const { user_id, hamster_id, start_time, end_time } = req.body;
    if (!user_id || !hamster_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'Chybí povinná pole: user_id, hamster_id, start_time, end_time.' });
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    const now = getEffectiveTime(req);

    const reservation = await createReservation(user_id, hamster_id, start, end, now);
    res.status(201).json(reservation);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// GET /api/reservations — Seznam rezervací (s volitelným filtrem user_id a status)
// --------------------------------------------------------------------------
app.get('/api/reservations', async (req: Request, res: Response) => {
  try {
    const { user_id, status } = req.query;
    let query = 'SELECT * FROM reservations WHERE 1=1';
    const params: any[] = [];
    if (user_id) {
      params.push(user_id);
      query += ` AND user_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    query += ' ORDER BY start_time DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// GET /api/reservations/:id — Detail rezervace (pro walking skeleton)
// --------------------------------------------------------------------------
app.get('/api/reservations/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const result = await pool.query('SELECT * FROM reservations WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Rezervace ID ${id} nebyla nalezena.` });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// OP-03: POST /api/reservations/:id/confirm — Potvrdit rezervaci
// --------------------------------------------------------------------------
app.post('/api/reservations/:id/confirm', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'Chybí identifikátor studenta (user_id).' });
    }

    const now = getEffectiveTime(req);
    const result = await confirmReservation(id, user_id, now);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({
      error: err.message,
      offerTimeShift: err.offerTimeShift || false,
    });
  }
});

// --------------------------------------------------------------------------
// OP-04: POST /api/reservations/:id/cancel — Zrušit rezervaci
// --------------------------------------------------------------------------
app.post('/api/reservations/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'Chybí identifikátor studenta (user_id).' });
    }

    const now = getEffectiveTime(req);
    const result = await cancelReservation(id, user_id, now);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// OP-05: POST /api/reservations/:id/decide — Rozhodnout o žádosti (Approve / Reject)
// --------------------------------------------------------------------------
app.post('/api/reservations/:id/decide', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const userRole = (req.headers['x-user-role'] as string) || req.body.role;
    const { decision } = req.body;

    if (!decision || (decision !== 'APPROVE' && decision !== 'REJECT')) {
      return res.status(400).json({ error: 'Pole decision musí být buď APPROVE nebo REJECT.' });
    }

    const now = getEffectiveTime(req);
    const result = await decideReservation(id, userRole, decision, now);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// OP-06: POST /api/reservations/expire — Expirace žádostí (Systémový časovač)
// --------------------------------------------------------------------------
app.post('/api/reservations/expire', async (req: Request, res: Response) => {
  try {
    const now = getEffectiveTime(req);
    const result = await expirePendingReservations(now);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// GET /api — Stav API
// --------------------------------------------------------------------------
app.get('/api', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'Křečkomat API',
    baseline: 'v0.2',
    hamsters: '/api/hamsters',
    reservations: '/api/reservations',
    availability: '/api/reservations/availability',
  });
});
