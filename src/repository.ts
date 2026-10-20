import { PoolClient, QueryResult } from 'pg';
import { pool } from './db';
import { ReservationStatus } from './domain';

export interface ReservationRow {
  id: number;
  user_id: string;
  hamster_id: string;
  start_time: Date;
  end_time: Date;
  status: ReservationStatus;
  created_at: Date;
}

export interface HamsterRow {
  id: string;
  name: string;
  is_active: boolean;
  requires_approval: boolean;
}

export interface OutboxRow {
  id: number;
  reservation_id: number;
  recipient: string;
  message: string;
  status: string;
  created_at: Date;
}

export type DbExecutor = PoolClient | typeof pool;

export interface IReservationRepository {
  findHamsterById(executor: DbExecutor, id: string): Promise<HamsterRow | null>;
  findHamsterByIdForUpdate(client: PoolClient, id: string): Promise<HamsterRow | null>;
  findReservationById(executor: DbExecutor, id: number): Promise<ReservationRow | null>;
  findReservationByIdForUpdate(client: PoolClient, id: number): Promise<ReservationRow | null>;
  findActiveReservationsForHamster(
    executor: DbExecutor,
    hamsterId: string,
    excludeReservationId?: number
  ): Promise<ReservationRow[]>;
  findUserReservationsForHamster(
    executor: DbExecutor,
    userId: string,
    hamsterId: string,
    excludeReservationId?: number
  ): Promise<ReservationRow[]>;
  insertReservation(
    userId: string,
    hamsterId: string,
    start: Date,
    end: Date,
    status: ReservationStatus
  ): Promise<ReservationRow>;
  updateReservationStatus(
    executor: DbExecutor,
    id: number,
    status: ReservationStatus
  ): Promise<void>;
  insertOutboxNotification(
    executor: DbExecutor,
    reservationId: number,
    recipient: string,
    message: string
  ): Promise<number>;
  updateOutboxStatus(id: number, status: 'SENT' | 'FAILED'): Promise<void>;
  getAllHamsters(): Promise<HamsterRow[]>;
  getReservations(userId?: string, status?: string): Promise<ReservationRow[]>;
  findPendingReservationsBeforeTime(cutoffTime: Date): Promise<ReservationRow[]>;
  withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
}

export class PostgresReservationRepository implements IReservationRepository {
  async findHamsterById(executor: DbExecutor, id: string): Promise<HamsterRow | null> {
    const res = await executor.query('SELECT * FROM hamsters WHERE id = $1', [id]);
    return (res.rows[0] as HamsterRow) || null;
  }

  async findHamsterByIdForUpdate(client: PoolClient, id: string): Promise<HamsterRow | null> {
    const res = await client.query('SELECT * FROM hamsters WHERE id = $1 FOR UPDATE', [id]);
    return (res.rows[0] as HamsterRow) || null;
  }

  async findReservationById(executor: DbExecutor, id: number): Promise<ReservationRow | null> {
    const res = await executor.query('SELECT * FROM reservations WHERE id = $1', [id]);
    return (res.rows[0] as ReservationRow) || null;
  }

  async findReservationByIdForUpdate(client: PoolClient, id: number): Promise<ReservationRow | null> {
    const res = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [id]);
    return (res.rows[0] as ReservationRow) || null;
  }

  async findActiveReservationsForHamster(
    executor: DbExecutor,
    hamsterId: string,
    excludeReservationId?: number
  ): Promise<ReservationRow[]> {
    let query = `
      SELECT * FROM reservations
      WHERE hamster_id = $1
        AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
    `;
    const params: any[] = [hamsterId];

    if (excludeReservationId) {
      query += ' AND id != $2';
      params.push(excludeReservationId);
    }

    const res = await executor.query(query, params);
    return res.rows as ReservationRow[];
  }

  async findUserReservationsForHamster(
    executor: DbExecutor,
    userId: string,
    hamsterId: string,
    excludeReservationId?: number
  ): Promise<ReservationRow[]> {
    let query = `
      SELECT * FROM reservations
      WHERE user_id = $1
        AND hamster_id = $2
        AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
    `;
    const params: any[] = [userId, hamsterId];

    if (excludeReservationId) {
      query += ' AND id != $3';
      params.push(excludeReservationId);
    }

    const res = await executor.query(query, params);
    return res.rows as ReservationRow[];
  }

  async insertReservation(
    userId: string,
    hamsterId: string,
    start: Date,
    end: Date,
    status: ReservationStatus
  ): Promise<ReservationRow> {
    const insertRes = await pool.query(
      `INSERT INTO reservations (user_id, hamster_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, hamsterId, start, end, status]
    );
    return insertRes.rows[0] as ReservationRow;
  }

  async updateReservationStatus(
    executor: DbExecutor,
    id: number,
    status: ReservationStatus
  ): Promise<void> {
    await executor.query('UPDATE reservations SET status = $1 WHERE id = $2', [status, id]);
  }

  async insertOutboxNotification(
    executor: DbExecutor,
    reservationId: number,
    recipient: string,
    message: string
  ): Promise<number> {
    const res = await executor.query(
      `INSERT INTO notifications_outbox (reservation_id, recipient, message)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [reservationId, recipient, message]
    );
    return res.rows[0].id;
  }

  async updateOutboxStatus(id: number, status: 'SENT' | 'FAILED'): Promise<void> {
    await pool.query('UPDATE notifications_outbox SET status = $1 WHERE id = $2', [status, id]);
  }

  async getAllHamsters(): Promise<HamsterRow[]> {
    const res = await pool.query('SELECT * FROM hamsters ORDER BY name ASC');
    return res.rows as HamsterRow[];
  }

  async getReservations(userId?: string, status?: string): Promise<ReservationRow[]> {
    let query = 'SELECT * FROM reservations';
    const conditions: string[] = [];
    const params: any[] = [];

    if (userId) {
      params.push(userId);
      conditions.push(`user_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY start_time ASC';

    const res = await pool.query(query, params);
    return res.rows as ReservationRow[];
  }

  async findPendingReservationsBeforeTime(cutoffTime: Date): Promise<ReservationRow[]> {
    const res = await pool.query(
      `SELECT * FROM reservations
       WHERE status = 'PENDING_APPROVAL'
         AND start_time <= $1
       ORDER BY start_time ASC`,
      [cutoffTime]
    );
    return res.rows as ReservationRow[];
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const repository = new PostgresReservationRepository();
