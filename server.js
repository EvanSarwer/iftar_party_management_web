require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const { getPool } = require('./database/db');
const { applyMigrations } = require('./database/migrate');

const app = express();
const pool = getPool();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CBA14@2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'cba14-iftar-session-secret';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    name: 'cba14.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8,
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function sortAttendees(attendees) {
  return [...attendees].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'confirmed' ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
}

function formatTodayKey(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function getTodayConfirmed(attendees) {
  const todayKey = formatTodayKey();

  return attendees.filter(
    (attendee) => attendee.confirmedAt && attendee.confirmedAt.startsWith(todayKey)
  );
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || '')
    .replace(/\D/g, '')
    .trim();
}

function parseAmount(value) {
  const amount = Number.parseFloat(String(value || '').trim());

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function redirectAdmin(res, message, tab = 'attendance') {
  return res.redirect(`/admin?tab=${tab}&message=${message}`);
}

async function buildCalculationViewModel() {
  const store = await readStore();
  const attendees = sortAttendees(store.attendees);
  const confirmedAttendees = attendees.filter((item) => item.status === 'confirmed');
  const finance = await readFinanceData(confirmedAttendees.length, store.event.contribution);

  return {
    event: store.event,
    finance,
    counts: {
      total: attendees.length,
      confirmed: confirmedAttendees.length,
      pending: attendees.filter((item) => item.status === 'pending').length,
    },
    formatMoney,
    todayLabel: new Date().toLocaleDateString('en-BD', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
}

function mapEventRow(row) {
  return {
    title: row.title,
    tagline: row.tagline,
    description: row.description,
    contribution: Number(row.contribution),
    currency: row.currency,
    collectionDeadlineLabel: row.collection_deadline_label,
    dateLabel: row.date_label,
    venue: row.venue,
    whatsAppNumber: row.whats_app_number,
    bkash: row.bkash,
    collectionPoints: JSON.parse(row.collection_points_json),
    note: row.note,
  };
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapAttendeeRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    confirmedAt: toIsoString(row.confirmed_at),
  };
}

function mapDonationRow(row) {
  return {
    id: row.id,
    donorName: row.donor_name,
    donorPhone: row.donor_phone,
    amount: Number(row.amount),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapPerPersonExpenseRow(row, confirmedCount) {
  const amountPerPerson = Number(row.amount_per_person);

  return {
    id: row.id,
    itemName: row.item_name,
    amountPerPerson,
    totalAmount: Number((amountPerPerson * confirmedCount).toFixed(2)),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapGeneralExpenseRow(row) {
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function readFinanceData(confirmedCount, contributionAmount) {
  const [donationRows] = await pool.query(
    'SELECT id, donor_name, donor_phone, amount, created_at, updated_at FROM donations ORDER BY created_at DESC, id DESC'
  );
  const [perPersonExpenseRows] = await pool.query(
    'SELECT id, item_name, amount_per_person, created_at, updated_at FROM per_person_expenses ORDER BY created_at DESC, id DESC'
  );
  const [generalExpenseRows] = await pool.query(
    'SELECT id, title, amount, created_at, updated_at FROM general_expenses ORDER BY created_at DESC, id DESC'
  );

  const donations = donationRows.map(mapDonationRow);
  const perPersonExpenses = perPersonExpenseRows.map((row) => mapPerPersonExpenseRow(row, confirmedCount));
  const generalExpenses = generalExpenseRows.map(mapGeneralExpenseRow);
  const memberContributionTotal = Number((confirmedCount * contributionAmount).toFixed(2));
  const donationsTotal = donations.reduce((sum, item) => sum + item.amount, 0);
  const collectionTotal = Number((memberContributionTotal + donationsTotal).toFixed(2));
  const perPersonExpenseTotal = perPersonExpenses.reduce((sum, item) => sum + item.totalAmount, 0);
  const generalExpenseTotal = generalExpenses.reduce((sum, item) => sum + item.amount, 0);
  const spentTotal = Number((perPersonExpenseTotal + generalExpenseTotal).toFixed(2));

  return {
    confirmedCount,
    contributionAmount,
    memberContributionTotal,
    donations,
    donationsTotal: Number(donationsTotal.toFixed(2)),
    collectionTotal,
    perPersonExpenses,
    perPersonExpenseTotal: Number(perPersonExpenseTotal.toFixed(2)),
    generalExpenses,
    generalExpenseTotal: Number(generalExpenseTotal.toFixed(2)),
    spentTotal,
    remainingBalance: Number((collectionTotal - spentTotal).toFixed(2)),
  };
}

async function createDonation(donorName, donorPhone, amount) {
  await pool.execute(
    'INSERT INTO donations (donor_name, donor_phone, amount) VALUES (?, ?, ?)',
    [donorName, donorPhone, amount]
  );
}

async function updateDonation(id, donorName, donorPhone, amount) {
  const [result] = await pool.execute(
    'UPDATE donations SET donor_name = ?, donor_phone = ?, amount = ? WHERE id = ?',
    [donorName, donorPhone, amount, id]
  );

  return result.affectedRows > 0;
}

async function deleteDonation(id) {
  const [result] = await pool.execute('DELETE FROM donations WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function createPerPersonExpense(itemName, amountPerPerson) {
  await pool.execute(
    'INSERT INTO per_person_expenses (item_name, amount_per_person) VALUES (?, ?)',
    [itemName, amountPerPerson]
  );
}

async function updatePerPersonExpense(id, itemName, amountPerPerson) {
  const [result] = await pool.execute(
    'UPDATE per_person_expenses SET item_name = ?, amount_per_person = ? WHERE id = ?',
    [itemName, amountPerPerson, id]
  );

  return result.affectedRows > 0;
}

async function deletePerPersonExpense(id) {
  const [result] = await pool.execute('DELETE FROM per_person_expenses WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function createGeneralExpense(title, amount) {
  await pool.execute('INSERT INTO general_expenses (title, amount) VALUES (?, ?)', [title, amount]);
}

async function updateGeneralExpense(id, title, amount) {
  const [result] = await pool.execute(
    'UPDATE general_expenses SET title = ?, amount = ? WHERE id = ?',
    [title, amount, id]
  );

  return result.affectedRows > 0;
}

async function deleteGeneralExpense(id) {
  const [result] = await pool.execute('DELETE FROM general_expenses WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function readStore() {
  const [[eventRow]] = await pool.query('SELECT * FROM event_settings WHERE id = 1 LIMIT 1');

  if (!eventRow) {
    throw new Error('Missing event_settings row with id = 1. Apply migrations and seed data first.');
  }

  const [attendeeRows] = await pool.query(
    `
      SELECT id, name, phone, status, created_at, confirmed_at
      FROM attendees
      ORDER BY CASE WHEN status = 'confirmed' THEN 0 ELSE 1 END, name ASC
    `
  );

  return {
    event: mapEventRow(eventRow),
    attendees: attendeeRows.map(mapAttendeeRow),
  };
}

async function findDuplicateAttendeeRecord(name, phone, excludedId = null) {
  const sql = excludedId
    ? `
        SELECT id, name, phone, status, created_at, confirmed_at
        FROM attendees
        WHERE (normalized_name = ? OR normalized_phone = ?) AND id <> ?
        LIMIT 1
      `
    : `
        SELECT id, name, phone, status, created_at, confirmed_at
        FROM attendees
        WHERE normalized_name = ? OR normalized_phone = ?
        LIMIT 1
      `;
  const params = excludedId
    ? [normalizeName(name), normalizePhone(phone), excludedId]
    : [normalizeName(name), normalizePhone(phone)];
  const [rows] = await pool.execute(sql, params);

  return rows.length ? mapAttendeeRow(rows[0]) : null;
}

async function createAttendeeRecord(name, phone) {
  try {
    await pool.execute(
      `
        INSERT INTO attendees (
          id,
          name,
          normalized_name,
          phone,
          normalized_phone,
          status,
          created_at,
          confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        normalizeName(name),
        phone,
        normalizePhone(phone),
        'pending',
        new Date(),
        null,
      ]
    );

    return { ok: true };
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') {
      return { ok: false, reason: 'duplicate' };
    }

    throw error;
  }
}

async function updateAttendeeStatus(id, status) {
  const confirmedAt = status === 'confirmed' ? new Date() : null;
  const [result] = await pool.execute(
    'UPDATE attendees SET status = ?, confirmed_at = ? WHERE id = ?',
    [status, confirmedAt, id]
  );

  return result.affectedRows > 0;
}

async function updateAttendeeRecord(id, name, phone) {
  const duplicate = await findDuplicateAttendeeRecord(name, phone, id);

  if (duplicate) {
    return 'duplicate';
  }

  const [result] = await pool.execute(
    `
      UPDATE attendees
      SET name = ?, normalized_name = ?, phone = ?, normalized_phone = ?
      WHERE id = ?
    `,
    [name, normalizeName(name), phone, normalizePhone(phone), id]
  );

  return result.affectedRows ? 'updated' : 'notfound';
}

async function deleteAttendeeRecord(id) {
  const [result] = await pool.execute('DELETE FROM attendees WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

function isAuthenticated(req) {
  return Boolean(req.session && req.session.isAdmin);
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin');
  }

  next();
}

app.get('/', async (req, res, next) => {
  try {
    const store = await readStore();
    const attendees = sortAttendees(store.attendees);

    res.render('index', {
      title: 'CBA14 Iftar Gathering 2026',
      currentPage: 'home',
      event: store.event,
      attendees,
      counts: {
        total: attendees.length,
        confirmed: attendees.filter((item) => item.status === 'confirmed').length,
        pending: attendees.filter((item) => item.status === 'pending').length,
      },
      success: req.query.success === '1',
      error: req.query.error || '',
    });
  } catch (error) {
    next(error);
  }
});

app.get('/contact', async (req, res, next) => {
  try {
    const store = await readStore();

    res.render('contact', {
      title: 'Contact | CBA14 Iftar Gathering 2026',
      currentPage: 'contact',
      event: store.event,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/calculation', async (req, res, next) => {
  try {
    const viewModel = await buildCalculationViewModel();

    res.render('calculation', {
      title: 'Calculation | CBA14 Iftar Gathering 2026',
      currentPage: 'calculation',
      ...viewModel,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/calculation/invoice', async (req, res, next) => {
  try {
    const viewModel = await buildCalculationViewModel();

    res.render('invoice', {
      title: 'Invoice | CBA14 Iftar Gathering 2026',
      ...viewModel,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin', async (req, res, next) => {
  try {
    const store = await readStore();
    const attendees = sortAttendees(store.attendees);
    const messageMap = {
      confirmed: 'Attendee confirmed successfully.',
      reverted: 'Attendee moved back to pending.',
      updated: 'Attendee details updated successfully.',
      deleted: 'Attendee deleted successfully.',
      invalid: 'Name and mobile number are required.',
      invalidfinance: 'All required finance fields must be filled in.',
      invalidamount: 'Enter a valid amount greater than or equal to zero.',
      duplicate: 'Name and mobile number must both be unique. Duplicate entry is not allowed.',
      notfound: 'Attendee not found.',
      recordnotfound: 'Requested finance record was not found.',
      donationadded: 'Donation added successfully.',
      donationupdated: 'Donation updated successfully.',
      donationdeleted: 'Donation deleted successfully.',
      personexpenseadded: 'Per-person expense item added successfully.',
      personexpenseupdated: 'Per-person expense item updated successfully.',
      personexpensedeleted: 'Per-person expense item deleted successfully.',
      generalexpenseadded: 'General expense added successfully.',
      generalexpenseupdated: 'General expense updated successfully.',
      generalexpensedeleted: 'General expense deleted successfully.',
    };
    const messageKey = String(req.query.message || '');
    const currentTab = req.query.tab === 'finance' ? 'finance' : 'attendance';
    const confirmedAttendees = attendees.filter((item) => item.status === 'confirmed');
    const pendingAttendees = attendees.filter((item) => item.status === 'pending');
    const finance = isAuthenticated(req)
      ? await readFinanceData(confirmedAttendees.length, store.event.contribution)
      : null;

    res.render('admin', {
      title: 'Admin | CBA14 Iftar Gathering 2026',
      currentPage: 'admin',
      event: store.event,
      isAdmin: isAuthenticated(req),
      currentAdminTab: currentTab,
      loginError: req.query.error === '1',
      adminMessage: messageMap[messageKey] || '',
      attendees,
      pendingAttendees,
      confirmedAttendees,
      todayConfirmed: getTodayConfirmed(attendees),
      finance,
      formatMoney,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/attendees', async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(req.body.phone || '').trim();

  if (!name || !phone) {
    return res.status(400).json({
      ok: false,
      message: 'Name and mobile number are required.',
    });
  }

  try {
    const result = await createAttendeeRecord(name, phone);

    if (!result.ok && result.reason === 'duplicate') {
      return res.status(409).json({
        ok: false,
        message: 'Name and mobile number must both be unique. Duplicate entry is not allowed.',
      });
    }

    return res.json({
      ok: true,
      message: 'Your name has been added with pending status.',
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Unable to save attendee right now.',
    });
  }
});

app.post('/admin/login', (req, res) => {
  const password = String(req.body.password || '').trim();

  if (password !== ADMIN_PASSWORD) {
    return res.redirect('/admin?error=1');
  }

  req.session.isAdmin = true;
  return req.session.save(() => res.redirect('/admin'));
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin');
  });
});

app.post('/admin/confirm/:id', requireAdmin, async (req, res, next) => {
  try {
    const updated = await updateAttendeeStatus(req.params.id, 'confirmed');

    if (updated) {
      return res.redirect('/admin?message=confirmed');
    }

    return res.redirect('/admin?message=notfound');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/pending/:id', requireAdmin, async (req, res, next) => {
  try {
    const updated = await updateAttendeeStatus(req.params.id, 'pending');

    if (updated) {
      return res.redirect('/admin?message=reverted');
    }

    return res.redirect('/admin?message=notfound');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/update/:id', requireAdmin, async (req, res, next) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(req.body.phone || '').trim();

  if (!name || !phone) {
    return res.redirect('/admin?message=invalid');
  }

  try {
    const result = await updateAttendeeRecord(req.params.id, name, phone);

    if (result === 'duplicate') {
      return res.redirect('/admin?message=duplicate');
    }

    if (result === 'notfound') {
      return res.redirect('/admin?message=notfound');
    }

    return res.redirect('/admin?message=updated');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/delete/:id', requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteAttendeeRecord(req.params.id);

    if (!deleted) {
      return res.redirect('/admin?message=notfound');
    }

    return res.redirect('/admin?message=deleted');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/donations', requireAdmin, async (req, res, next) => {
  const donorName = String(req.body.donorName || '').trim().replace(/\s+/g, ' ');
  const donorPhone = String(req.body.donorPhone || '').trim();
  const amount = parseAmount(req.body.amount);

  if (!donorName || !donorPhone) {
    return redirectAdmin(res, 'invalidfinance', 'finance');
  }

  if (amount === null || amount <= 0) {
    return redirectAdmin(res, 'invalidamount', 'finance');
  }

  try {
    await createDonation(donorName, donorPhone, amount);
    return redirectAdmin(res, 'donationadded', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/donations/:id/update', requireAdmin, async (req, res, next) => {
  const donorName = String(req.body.donorName || '').trim().replace(/\s+/g, ' ');
  const donorPhone = String(req.body.donorPhone || '').trim();
  const amount = parseAmount(req.body.amount);

  if (!donorName || !donorPhone) {
    return redirectAdmin(res, 'invalidfinance', 'finance');
  }

  if (amount === null || amount <= 0) {
    return redirectAdmin(res, 'invalidamount', 'finance');
  }

  try {
    const updated = await updateDonation(req.params.id, donorName, donorPhone, amount);
    return updated ? redirectAdmin(res, 'donationupdated', 'finance') : redirectAdmin(res, 'recordnotfound', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/donations/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteDonation(req.params.id);
    return deleted ? redirectAdmin(res, 'donationdeleted', 'finance') : redirectAdmin(res, 'recordnotfound', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/per-person-expenses', requireAdmin, async (req, res, next) => {
  const itemName = String(req.body.itemName || '').trim().replace(/\s+/g, ' ');
  const amountPerPerson = parseAmount(req.body.amountPerPerson);

  if (!itemName) {
    return redirectAdmin(res, 'invalidfinance', 'finance');
  }

  if (amountPerPerson === null || amountPerPerson <= 0) {
    return redirectAdmin(res, 'invalidamount', 'finance');
  }

  try {
    await createPerPersonExpense(itemName, amountPerPerson);
    return redirectAdmin(res, 'personexpenseadded', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/per-person-expenses/:id/update', requireAdmin, async (req, res, next) => {
  const itemName = String(req.body.itemName || '').trim().replace(/\s+/g, ' ');
  const amountPerPerson = parseAmount(req.body.amountPerPerson);

  if (!itemName) {
    return redirectAdmin(res, 'invalidfinance', 'finance');
  }

  if (amountPerPerson === null || amountPerPerson <= 0) {
    return redirectAdmin(res, 'invalidamount', 'finance');
  }

  try {
    const updated = await updatePerPersonExpense(req.params.id, itemName, amountPerPerson);
    return updated ? redirectAdmin(res, 'personexpenseupdated', 'finance') : redirectAdmin(res, 'recordnotfound', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/per-person-expenses/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deletePerPersonExpense(req.params.id);
    return deleted ? redirectAdmin(res, 'personexpensedeleted', 'finance') : redirectAdmin(res, 'recordnotfound', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/general-expenses', requireAdmin, async (req, res, next) => {
  const title = String(req.body.title || '').trim().replace(/\s+/g, ' ');
  const amount = parseAmount(req.body.amount);

  if (!title) {
    return redirectAdmin(res, 'invalidfinance', 'finance');
  }

  if (amount === null || amount <= 0) {
    return redirectAdmin(res, 'invalidamount', 'finance');
  }

  try {
    await createGeneralExpense(title, amount);
    return redirectAdmin(res, 'generalexpenseadded', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/general-expenses/:id/update', requireAdmin, async (req, res, next) => {
  const title = String(req.body.title || '').trim().replace(/\s+/g, ' ');
  const amount = parseAmount(req.body.amount);

  if (!title) {
    return redirectAdmin(res, 'invalidfinance', 'finance');
  }

  if (amount === null || amount <= 0) {
    return redirectAdmin(res, 'invalidamount', 'finance');
  }

  try {
    const updated = await updateGeneralExpense(req.params.id, title, amount);
    return updated ? redirectAdmin(res, 'generalexpenseupdated', 'finance') : redirectAdmin(res, 'recordnotfound', 'finance');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/general-expenses/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const deleted = await deleteGeneralExpense(req.params.id);
    return deleted ? redirectAdmin(res, 'generalexpensedeleted', 'finance') : redirectAdmin(res, 'recordnotfound', 'finance');
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found',
    currentPage: '',
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('500', {
    title: 'Server Error',
    currentPage: '',
  });
});

async function startServer() {
  const appliedCount = await applyMigrations();
  await pool.query('SELECT 1');

  if (appliedCount > 0) {
    console.log(`Applied ${appliedCount} database migration(s).`);
  }

  console.log('Using MySQL storage.');

  app.listen(PORT, () => {
    console.log(`CBA14 Iftar app running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start application.', error);
  process.exit(1);
});
