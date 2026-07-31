export const orderStatusQuery = `
  SELECT order_id, payment_status, delivery_status, updated_at
  FROM v_bob_order_status
  WHERE order_id = $1
  LIMIT 1
`;

export const failedPaymentSummaryQuery = `
  SELECT delivery_status, COUNT(*)::int AS count
  FROM v_bob_order_status
  WHERE payment_status = 'FAILED'
    AND updated_at >= $1::date
    AND updated_at < ($1::date + INTERVAL '1 day')
  GROUP BY delivery_status
  ORDER BY delivery_status
  LIMIT 20
`;

export const recentOrdersQuery = `
  SELECT order_id, payment_status, delivery_status, updated_at
  FROM v_bob_order_status
  ORDER BY updated_at DESC
  LIMIT $1
`;

export const failedPaymentTrendQuery = `
  SELECT
    to_char(updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
    COUNT(*)::int AS total_count,
    COUNT(*) FILTER (WHERE payment_status = 'FAILED')::int AS failed_count
  FROM v_bob_order_status
  WHERE updated_at >= now() - ($1::int * INTERVAL '1 day')
  GROUP BY to_char(updated_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
  ORDER BY date
  LIMIT 7
`;
