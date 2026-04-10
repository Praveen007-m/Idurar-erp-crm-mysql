const safeJsonParse = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback ?? value;
  }
};

const toBoolean = (value) => Boolean(Number(value) || value === true);

const normalizeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMysqlDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);

const normalizeTimeString = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || '00');

  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const mapAdmin = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    removed: row.removed === undefined ? false : toBoolean(row.removed),
    enabled: row.enabled === undefined ? true : toBoolean(row.enabled),
    name: row.name,
    surname: row.surname || '',
    email: row.email,
    phone: row.phone || '',
    password: row.password,
    photo: row.photo || '',
    role: row.role,
    created: row.created_at || row.created || null,
    updated: row.updated_at || row.updated || null,
  };
};

const mapClientPaymentDetails = (row) => ({
  upiId: row?.upi_id || '',
  bankName: row?.bank_name || '',
  accountHolderName: row?.account_holder_name || '',
  accountNumber: row?.account_number || '',
  ifscCode: row?.ifsc_code || '',
});

const mapClient = (row) => {
  if (!row) return null;

  const assigned =
    row.assigned_id || row.assigned_name || row.assigned_email
      ? {
          _id: row.assigned_id,
          id: row.assigned_id,
          name: row.assigned_name,
          email: row.assigned_email,
          role: row.assigned_role,
        }
      : row.assigned || null;

  return {
    _id: row.id,
    id: row.id,
    removed: toBoolean(row.removed),
    enabled: toBoolean(row.enabled),
    name: row.name,
    phone: row.phone,
    country: row.country || '',
    address: row.address || '',
    email: row.email || '',
    loanAmount: normalizeNumber(row.loan_amount),
    interestRate: normalizeNumber(row.interest_rate),
    term: String(row.term ?? ''),
    startDate: row.start_date,
    endDate: row.end_date,
    repaymentType: row.repayment_type,
    collectionTime: normalizeTimeString(row.collection_time),
    photo: row.photo || '',
    status: row.status,
    paymentDetails: mapClientPaymentDetails(row),
    createdBy: row.created_by,
    assigned: assigned,
    created: row.created_at || row.created || null,
    updated: row.updated_at || row.updated || null,
  };
};

const mapInvoiceItem = (row) => ({
  _id: row.id,
  id: row.id,
  itemName: row.item_name,
  description: row.description || '',
  quantity: normalizeNumber(row.quantity),
  price: normalizeNumber(row.price),
  total: normalizeNumber(row.total),
});

const mapInvoiceFile = (row) => ({
  id: row.file_id || row.id,
  _id: row.id,
  name: row.name,
  path: row.path,
  description: row.description || '',
  isPublic: row.is_public === undefined ? true : toBoolean(row.is_public),
});

const mapInvoice = (row, items = [], files = [], payments = []) => {
  if (!row) return null;

  const converted = {
    from: row.converted_from || '',
    offer: row.converted_offer_id || null,
    quote: row.converted_quote_id || null,
  };

  return {
    _id: row.id,
    id: row.id,
    removed: toBoolean(row.removed),
    createdBy:
      row.created_by_name || row.created_by_email
        ? {
            _id: row.created_by,
            id: row.created_by,
            name: row.created_by_name,
            email: row.created_by_email,
          }
        : row.created_by,
    number: row.number,
    year: row.year,
    content: row.content || '',
    recurring: row.recurring || null,
    date: row.date,
    expiredDate: row.expired_date,
    client:
      row.client_name || row.client_email || row.client_phone
        ? {
            _id: row.client_id,
            id: row.client_id,
            name: row.client_name,
            email: row.client_email || '',
            phone: row.client_phone || '',
            address: row.client_address || '',
          }
        : row.client_id,
    converted,
    items,
    taxRate: normalizeNumber(row.tax_rate),
    subTotal: normalizeNumber(row.sub_total),
    taxTotal: normalizeNumber(row.tax_total),
    total: normalizeNumber(row.total),
    currency: row.currency,
    credit: normalizeNumber(row.credit),
    discount: normalizeNumber(row.discount),
    payment: payments,
    paymentStatus: row.payment_status,
    isOverdue: toBoolean(row.is_overdue),
    approved: toBoolean(row.approved),
    notes: row.notes || '',
    status: row.status,
    pdf: row.pdf || '',
    files,
    updated: row.updated_at || row.updated || null,
    created: row.created_at || row.created || null,
  };
};

const mapPayment = (row) => {
  if (!row) return null;

  const paymentModeName = row.payment_mode_name || row.payment_mode || row.payment_mode_label || 'Cash';

  return {
    _id: row.id,
    id: row.id,
    removed: toBoolean(row.removed),
    createdBy:
      row.created_by_name || row.created_by_email
        ? {
            _id: row.created_by,
            id: row.created_by,
            name: row.created_by_name,
            email: row.created_by_email,
          }
        : row.created_by,
    number: row.number,
    client:
      row.client_name || row.client_email || row.client_phone
        ? {
            _id: row.client_id,
            id: row.client_id,
            name: row.client_name,
            email: row.client_email || '',
            phone: row.client_phone || '',
          }
        : row.client_id,
    invoice:
      row.invoice_number || row.invoice_id
        ? {
            _id: row.invoice_id,
            id: row.invoice_id,
            number: row.invoice_number,
            total: normalizeNumber(row.invoice_total),
            discount: normalizeNumber(row.invoice_discount),
            credit: normalizeNumber(row.invoice_credit),
          }
        : null,
    date: row.date,
    amount: normalizeNumber(row.amount),
    currency: row.currency,
    paymentMode:
      row.payment_mode_id || row.payment_mode_name
        ? {
            _id: row.payment_mode_id || null,
            id: row.payment_mode_id || null,
            name: paymentModeName,
          }
        : paymentModeName,
    reference: row.reference_id ? row.reference_id : null,
    ref: row.ref || '',
    description: row.description || '',
    pdf: row.pdf || '',
    updated: row.updated_at || row.updated || null,
    created: row.created_at || row.created || null,
  };
};

const mapRepayment = (row) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    removed: toBoolean(row.removed),
    client:
      row.client_name || row.client_email || row.client_phone
        ? {
            _id: row.client_id,
            id: row.client_id,
            name: row.client_name,
            email: row.client_email || '',
            phone: row.client_phone || '',
          }
        : row.client_id,
    date: row.date,
    amount: normalizeNumber(row.amount),
    amountPaid: normalizeNumber(row.amount_paid),
    balance: normalizeNumber(row.balance),
    remainingBalance: normalizeNumber(row.remaining_balance),
    principal: normalizeNumber(row.principal),
    interest: normalizeNumber(row.interest),
    status: row.status,
    paymentDate: row.payment_date,
    paidDate: row.paid_date,
    notes: row.notes || '',
    createdBy: row.created_by,
    created: row.created_at || row.created || null,
    updated: row.updated_at || row.updated || null,
  };
};

module.exports = {
  safeJsonParse,
  toBoolean,
  normalizeNumber,
  toMysqlDateTime,
  normalizePhone,
  normalizeTimeString,
  mapAdmin,
  mapClient,
  mapInvoice,
  mapInvoiceItem,
  mapInvoiceFile,
  mapPayment,
  mapRepayment,
};
