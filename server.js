const express = require('express');
const session = require('express-session');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CBA14@2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'cba14-iftar-session-secret';
const DATA_FILE = path.join(__dirname, 'data', 'store.json');

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

async function readStore() {
  const raw = await fs.readFile(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function writeStore(store) {
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

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

function findDuplicateAttendee(attendees, name, phone, excludedId = null) {
  const normalizedName = normalizeName(name);
  const normalizedPhone = normalizePhone(phone);

  return attendees.find((item) => {
    if (excludedId && item.id === excludedId) {
      return false;
    }

    return normalizeName(item.name) === normalizedName || normalizePhone(item.phone) === normalizedPhone;
  });
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
      duplicate: 'Name and mobile number must both be unique. Duplicate entry is not allowed.',
      notfound: 'Attendee not found.',
    };
    const messageKey = String(req.query.message || '');

    res.render('admin', {
      title: 'Admin | CBA14 Iftar Gathering 2026',
      currentPage: 'admin',
      event: store.event,
      isAdmin: isAuthenticated(req),
      loginError: req.query.error === '1',
      adminMessage: messageMap[messageKey] || '',
      attendees,
      pendingAttendees: attendees.filter((item) => item.status === 'pending'),
      confirmedAttendees: attendees.filter((item) => item.status === 'confirmed'),
      todayConfirmed: getTodayConfirmed(attendees),
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
    const store = await readStore();
    const alreadyExists = findDuplicateAttendee(store.attendees, name, phone);

    if (alreadyExists) {
      return res.status(409).json({
        ok: false,
        message: 'Name and mobile number must both be unique. Duplicate entry is not allowed.',
      });
    }

    store.attendees.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      phone,
      status: 'pending',
      createdAt: new Date().toISOString(),
      confirmedAt: null,
    });

    await writeStore(store);

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
    const store = await readStore();
    const attendee = store.attendees.find((item) => item.id === req.params.id);

    if (attendee) {
      attendee.status = 'confirmed';
      attendee.confirmedAt = new Date().toISOString();
      await writeStore(store);
      return res.redirect('/admin?message=confirmed');
    }

    res.redirect('/admin?message=notfound');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/pending/:id', requireAdmin, async (req, res, next) => {
  try {
    const store = await readStore();
    const attendee = store.attendees.find((item) => item.id === req.params.id);

    if (attendee) {
      attendee.status = 'pending';
      attendee.confirmedAt = null;
      await writeStore(store);
      return res.redirect('/admin?message=reverted');
    }

    res.redirect('/admin?message=notfound');
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
    const store = await readStore();
    const attendee = store.attendees.find((item) => item.id === req.params.id);

    if (!attendee) {
      return res.redirect('/admin?message=notfound');
    }

    const duplicate = findDuplicateAttendee(store.attendees, name, phone, req.params.id);

    if (duplicate) {
      return res.redirect('/admin?message=duplicate');
    }

    attendee.name = name;
    attendee.phone = phone;
    await writeStore(store);

    return res.redirect('/admin?message=updated');
  } catch (error) {
    next(error);
  }
});

app.post('/admin/delete/:id', requireAdmin, async (req, res, next) => {
  try {
    const store = await readStore();
    const attendeeIndex = store.attendees.findIndex((item) => item.id === req.params.id);

    if (attendeeIndex === -1) {
      return res.redirect('/admin?message=notfound');
    }

    store.attendees.splice(attendeeIndex, 1);
    await writeStore(store);

    return res.redirect('/admin?message=deleted');
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

app.listen(PORT, () => {
  console.log(`CBA14 Iftar app running at http://localhost:${PORT}`);
});
