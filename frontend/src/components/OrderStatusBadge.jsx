const ORDER_STATUS_MAP = {
  placed:     { label: 'Order Placed',  color: 'status--placed' },
  confirmed:  { label: 'Confirmed',     color: 'status--confirmed' },
  dispatched: { label: 'Dispatched',    color: 'status--dispatched' },
  delivered:  { label: 'Delivered',     color: 'status--delivered' },
  cancelled:  { label: 'Cancelled',     color: 'status--cancelled' },
};

export default function OrderStatusBadge({ status }) {
  const { label, color } = ORDER_STATUS_MAP[status] || { label: status, color: '' };
  return <span className={`status-badge ${color}`}>{label}</span>;
}
