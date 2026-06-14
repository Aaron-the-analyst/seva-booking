// ==========================================================================
// Seva Booking Management System - Application Logic & State Controller
// ==========================================================================

// Global Application State
const STATE = {
  activeView: 'customer-booking-flow',
  activeWizardStep: 1,
  accessibilityMode: false,
  cart: {
    serviceId: null,
    date: '',
    slotTime: '',
    devoteeDetails: {
      name: '',
      phone: '',
      email: '',
      city: '',
      participants: 1,
      gotra: '',
      requests: ''
    },
    donation: 0,
    promo: null
  },
  services: [],
  priests: [],
  bookings: [],
  notifications: [],
  inventory: {},
  adminSettings: {},
  currentYear: 2026,
  currentMonth: 5, // June (0-indexed)
  adminInvYear: 2026,
  adminInvMonth: 5,
  selectedAdminInvDate: null,
  selectedAdminBookingId: null,
  convenienceFee: 20,
  taxRate: 0.05,
  selectedPaymentMethod: 'upi',
  currentBookingId: null,
  adminToken: localStorage.getItem('adminToken') || null,
  adminUser: null
};

// API Helper
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Add admin auth token if available
  if (STATE.adminToken) {
    headers['Authorization'] = `Bearer ${STATE.adminToken}`;
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'API Error');
  }
  return res.json();
}

// ==========================================================================
// Admin Authentication
// ==========================================================================
async function adminLogin(email, password) {
  try {
    const response = await api('/admin/login', {
      method: 'POST',
      body: { email, password }
    });

    STATE.adminToken = response.token;
    STATE.adminUser = response.admin;
    localStorage.setItem('adminToken', response.token);

    showToast('Admin login successful!', 'success');
    return true;
  } catch (err) {
    showToast('Login failed: ' + err.message, 'error');
    return false;
  }
}

async function adminLogout() {
  try {
    await api('/admin/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error:', err);
  }
  STATE.adminToken = null;
  STATE.adminUser = null;
  localStorage.removeItem('adminToken');
  showToast('Logged out successfully', 'info');
}

async function checkAdminSession() {
  if (!STATE.adminToken) return false;

  try {
    const admin = await api('/admin/me');
    STATE.adminUser = admin;
    return true;
  } catch (err) {
    STATE.adminToken = null;
    localStorage.removeItem('adminToken');
    return false;
  }
}

async function loadAdminSettings() {
  try {
    STATE.adminSettings = await api('/admin/settings');
    STATE.convenienceFee = STATE.adminSettings.convenience_fee || 20;
    STATE.taxRate = (STATE.adminSettings.tax_rate || 5) / 100;
    return STATE.adminSettings;
  } catch (err) {
    console.error('Failed to load admin settings:', err);
    return null;
  }
}

async function updateAdminSetting(key, value) {
  try {
    await api(`/admin/settings/${key}`, {
      method: 'PATCH',
      body: { value }
    });
    showToast('Setting updated!', 'success');
    await loadAdminSettings();
  } catch (err) {
    showToast('Failed to update setting: ' + err.message, 'error');
  }
}

// ==========================================================================
// Toast Messaging helper
// ==========================================================================
function showToast(message, type = "success") {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  let icon = "check-circle";
  if (type === "error") icon = "alert-circle";
  if (type === "info") icon = "info";
  toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.25s forwards';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// Add CSS keyframes dynamically
const styleEl = document.createElement('style');
styleEl.innerHTML = `@keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(10px); } }`;
document.head.appendChild(styleEl);

// ==========================================================================
// Data Loading from API
// ==========================================================================
async function loadServices() {
  try {
    STATE.services = await api('/services');
  } catch (err) {
    console.error('Failed to load services:', err);
    showToast('Failed to load services', 'error');
  }
}

async function loadPriests() {
  try {
    STATE.priests = await api('/priests');
  } catch (err) {
    console.error('Failed to load priests:', err);
  }
}

async function loadInventory(month, year) {
  try {
    const data = await api(`/inventory?month=${month + 1}&year=${year}`);
    STATE.inventory = {};
    data.forEach(item => {
      STATE.inventory[item.date] = {
        capacity: item.capacity,
        type: item.day_type,
        festivalName: item.festival_name,
        waitlistEnabled: item.waitlist_enabled
      };
    });
  } catch (err) {
    console.error('Failed to load inventory:', err);
  }
}

async function loadBookings(filters = {}) {
  try {
    const params = new URLSearchParams(filters).toString();
    STATE.bookings = await api(`/bookings?${params}`);
  } catch (err) {
    console.error('Failed to load bookings:', err);
  }
}

async function loadNotifications(bookingId = null) {
  try {
    const url = bookingId ? `/notifications?booking_id=${bookingId}` : '/notifications';
    STATE.notifications = await api(url);
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

// ==========================================================================
// Routing View Switcher
// ==========================================================================
function switchView(viewId) {
  document.getElementById('mobile-nav-menu').style.display = 'none';
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-target') === viewId);
  });
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === viewId);
  });
  STATE.activeView = viewId;

  if (viewId === 'customer-dashboard') {
    renderCustomerDashboard();
  } else if (viewId === 'admin-dashboard') {
    renderAdminPortal();
  } else if (viewId === 'customer-booking-flow') {
    if (STATE.activeWizardStep > 4) resetBookingWizard();
    updateWizardDisplay();
  }
}

function resetBookingWizard() {
  STATE.activeWizardStep = 1;
  STATE.cart = {
    serviceId: null, date: '', slotTime: '',
    devoteeDetails: { name: '', phone: '', email: '', city: '', participants: 1, gotra: '', requests: '' },
    donation: 0, promo: null
  };
  STATE.currentBookingId = null;
  document.getElementById('devotee-details-form')?.reset();
  document.getElementById('promo-code').value = '';
  document.getElementById('promo-status-msg').innerText = '';
  document.querySelectorAll('.donation-option-card').forEach(c => c.classList.remove('active'));
  updateWizardDisplay();
}

// Navigation event triggers
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => switchView(link.getAttribute('data-target')));
});
document.getElementById('brand-home').addEventListener('click', () => switchView('customer-booking-flow'));
document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  const menu = document.getElementById('mobile-nav-menu');
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
});

// ==========================================================================
// Elderly-Friendly Mode
// ==========================================================================
function toggleElderlyMode() {
  const switchEl = document.getElementById('accessibility-toggle');
  STATE.accessibilityMode = !STATE.accessibilityMode;
  document.body.classList.toggle('elderly-mode', STATE.accessibilityMode);
  switchEl.classList.toggle('active', STATE.accessibilityMode);
  showToast(STATE.accessibilityMode ? "Elderly Accessibility Mode Activated" : "Standard interface mode restored", "info");
  localStorage.setItem('sevabook_elderly_mode', STATE.accessibilityMode);
  if (STATE.activeView === 'customer-booking-flow') updateWizardDisplay();
}

document.getElementById('accessibility-toggle').addEventListener('click', toggleElderlyMode);
if (localStorage.getItem('sevabook_elderly_mode') === 'true') toggleElderlyMode();

// ==========================================================================
// Customer Booking Wizard Controller
// ==========================================================================
function updateWizardDisplay() {
  document.querySelectorAll('.wizard-step').forEach(step => {
    const sNum = parseInt(step.getAttribute('data-step'));
    step.classList.remove('active', 'completed');
    if (sNum === STATE.activeWizardStep) step.classList.add('active');
    else if (sNum < STATE.activeWizardStep) step.classList.add('completed');
  });

  document.querySelectorAll('.wizard-pane').forEach((pane, idx) => {
    pane.style.display = idx === (STATE.activeWizardStep - 1) ? 'block' : 'none';
  });

  const sidebar = document.getElementById('booking-sidebar-panel');
  const bookingGrid = document.getElementById('booking-grid-wrapper');
  if (STATE.activeWizardStep >= 2 && STATE.activeWizardStep <= 3) {
    sidebar.style.display = 'block';
    bookingGrid.classList.add('grid-2');
    renderStickySummary();
  } else {
    sidebar.style.display = 'none';
    bookingGrid.classList.remove('grid-2');
  }

  if (STATE.activeWizardStep === 1) renderServicesCatalog();
  else if (STATE.activeWizardStep === 2) { renderCalendar(); renderSlots(); validateStep2Next(); }
  else if (STATE.activeWizardStep === 3) window.scrollTo({ top: 0, behavior: 'smooth' });
  else if (STATE.activeWizardStep === 4) renderReviewPayPane();

  lucide.createIcons();
}

function nextWizardStep() {
  if (STATE.activeWizardStep < 4) {
    STATE.activeWizardStep++;
    updateWizardDisplay();
  }
}

function prevWizardStep() {
  if (STATE.activeWizardStep > 1) {
    STATE.activeWizardStep--;
    updateWizardDisplay();
  }
}

// ==========================================================================
// Step 1: Render Services Catalog
// ==========================================================================
let activeCategoryFilter = "All";

async function renderServicesCatalog() {
  const container = document.getElementById('services-list-container');
  const searchVal = document.getElementById('seva-search').value.toLowerCase();

  // Load services if not loaded
  if (STATE.services.length === 0) await loadServices();

  const filtered = STATE.services.filter(s => {
    const matchesCat = activeCategoryFilter === "All" || s.category === activeCategoryFilter;
    const matchesSearch = s.name.toLowerCase().includes(searchVal) || s.priest.toLowerCase().includes(searchVal);
    return matchesCat && matchesSearch;
  });

  // Render category tabs once
  const tabsContainer = document.getElementById('category-tabs-list');
  if (tabsContainer.children.length === 0) {
    const cats = ["All", ...new Set(STATE.services.map(s => s.category))];
    tabsContainer.innerHTML = cats.map(c => `
      <div class="category-tab ${c === activeCategoryFilter ? 'active' : ''}" data-cat="${c}">${c}</div>
    `).join('');
    tabsContainer.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        tabsContainer.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeCategoryFilter = tab.getAttribute('data-cat');
        renderServicesCatalog();
      });
    });
  }

  // Render service cards
  container.innerHTML = filtered.map(s => `
    <div class="card service-card" onclick="selectService(${s.id})">
      <div class="service-card-img" style="background: ${s.image_gradient || 'linear-gradient(135deg, #E35205, #D4AF37)'};">
        ${s.is_popular ? '<span class="service-badge">Popular</span>' : ''}
        ${s.is_recommended ? '<span class="service-badge">Recommended</span>' : ''}
      </div>
      <div class="service-card-content">
        <h3 class="service-card-title spiritual-title">${s.name}</h3>
        <ul class="service-meta-list">
          <li class="service-meta-item"><i data-lucide="clock" style="width:14px;"></i> ${s.duration}</li>
          <li class="service-meta-item"><i data-lucide="user" style="width:14px;"></i> ${s.priest}</li>
          <li class="service-meta-item"><i data-lucide="tag" style="width:14px;"></i> ${s.category}</li>
        </ul>
        <div class="service-price-row">
          <span class="service-price">₹${s.price.toLocaleString()}</span>
          <span class="service-slots-left plenty">${s.max_slots} slots</span>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

document.getElementById('seva-search').addEventListener('input', renderServicesCatalog);

function selectService(serviceId) {
  STATE.cart.serviceId = serviceId;
  nextWizardStep();
}

// ==========================================================================
// Step 2: Calendar & Time Slots
// ==========================================================================
async function renderCalendar() {
  await loadInventory(STATE.currentMonth, STATE.currentYear);

  const grid = document.getElementById('calendar-grid-cells');
  const monthLabel = document.getElementById('calendar-month-year');
  const date = new Date(STATE.currentYear, STATE.currentMonth, 1);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  monthLabel.textContent = `${monthNames[STATE.currentMonth]} ${STATE.currentYear}`;

  const firstDay = date.getDay();
  const daysInMonth = new Date(STATE.currentYear, STATE.currentMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = '<div class="calendar-grid">';
  ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
    html += `<div class="calendar-day-header">${d}</div>`;
  });

  for (let i = 0; i < firstDay; i++) html += '<div class="calendar-day-cell disabled"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${STATE.currentYear}-${String(STATE.currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cellDate = new Date(STATE.currentYear, STATE.currentMonth, d);
    const isPast = cellDate < today;
    const inv = STATE.inventory[dateStr] || {};
    const isClosed = inv.type === 'Closed';
    const isFestival = inv.type === 'Festival';
    const isSelected = STATE.cart.date === dateStr;

    html += `
      <div class="calendar-day-cell ${isPast || isClosed ? 'disabled' : ''} ${isFestival ? 'festival' : ''} ${isSelected ? 'selected' : ''}"
           onclick="selectDate('${dateStr}')"
           title="${inv.festivalName || ''}">
        ${d}
      </div>
    `;
  }
  html += '</div>';
  grid.innerHTML = html;
  lucide.createIcons();
}

function selectDate(dateStr) {
  const cellDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inv = STATE.inventory[dateStr] || {};

  if (cellDate < today || inv.type === 'Closed') return;

  STATE.cart.date = dateStr;
  STATE.cart.slotTime = '';
  renderCalendar();
  renderSlots();
}

function renderSlots() {
  const container = document.getElementById('slots-grid-container');
  const slots = [
    { time: '06:00 AM', available: true },
    { time: '08:00 AM', available: true },
    { time: '10:00 AM', available: true },
    { time: '12:00 PM', available: false },
    { time: '02:00 PM', available: true },
    { time: '04:00 PM', available: true },
    { time: '06:00 PM', available: true },
    { time: '08:00 PM', available: true }
  ];

  container.innerHTML = slots.map(s => `
    <div class="slot-btn ${s.available ? '' : 'sold-out'} ${STATE.cart.slotTime === s.time ? 'selected' : ''}"
         onclick="${s.available ? `selectSlot('${s.time}')` : ''}">
      <span class="slot-time">${s.time}</span>
      <span class="slot-capacity">${s.available ? 'Available' : 'Sold Out'}</span>
    </div>
  `).join('');
}

function selectSlot(time) {
  STATE.cart.slotTime = time;
  renderSlots();
  validateStep2Next();
}

function validateStep2Next() {
  document.getElementById('step2-next').disabled = !(STATE.cart.date && STATE.cart.slotTime);
}

document.getElementById('cal-prev-month').addEventListener('click', () => {
  STATE.currentMonth--;
  if (STATE.currentMonth < 0) { STATE.currentMonth = 11; STATE.currentYear--; }
  renderCalendar();
});
document.getElementById('cal-next-month').addEventListener('click', () => {
  STATE.currentMonth++;
  if (STATE.currentMonth > 11) { STATE.currentMonth = 0; STATE.currentYear++; }
  renderCalendar();
});

// ==========================================================================
// Sticky Summary
// ==========================================================================
function renderStickySummary() {
  const service = STATE.services.find(s => s.id === STATE.cart.serviceId);
  const container = document.getElementById('sidebar-summary-details');
  if (!service) return;

  const base = service.price;
  const donation = STATE.cart.donation || 0;
  const fee = STATE.convenienceFee;
  const tax = Math.round((base + donation + fee) * STATE.taxRate);
  const total = base + donation + fee + tax;

  container.innerHTML = `
    <div class="summary-row"><span>Seva:</span><span>${service.name}</span></div>
    <div class="summary-row"><span>Date:</span><span>${STATE.cart.date || 'Not selected'}</span></div>
    <div class="summary-row"><span>Time:</span><span>${STATE.cart.slotTime || 'Not selected'}</span></div>
    <div class="summary-row"><span>Base Price:</span><span>₹${base.toLocaleString()}</span></div>
    ${donation > 0 ? `<div class="summary-row"><span>Donation:</span><span>₹${donation}</span></div>` : ''}
    <div class="summary-row"><span>Convenience Fee:</span><span>₹${fee}</span></div>
    <div class="summary-row"><span>Tax (5%):</span><span>₹${tax}</span></div>
    <div class="summary-row total"><span>Total:</span><span>₹${total.toLocaleString()}</span></div>
  `;
}

// ==========================================================================
// Step 3: Devotee Details Form
// ==========================================================================
document.querySelectorAll('.donation-option-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.donation-option-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    STATE.cart.donation = parseInt(card.getAttribute('data-donation')) || 0;
    renderStickySummary();
  });
});

document.getElementById('apply-promo-btn').addEventListener('click', () => {
  const code = document.getElementById('promo-code').value.toUpperCase();
  const msg = document.getElementById('promo-status-msg');
  if (code === 'DEVOTE10') {
    STATE.cart.promo = { code, discount: 10 };
    msg.style.color = 'var(--status-confirmed-text)';
    msg.textContent = 'Promo applied! 10% discount';
  } else if (code === 'FESTIVAL20') {
    STATE.cart.promo = { code, discount: 20 };
    msg.style.color = 'var(--status-confirmed-text)';
    msg.textContent = 'Promo applied! ₹20 discount';
  } else {
    STATE.cart.promo = null;
    msg.style.color = 'var(--status-cancelled-text)';
    msg.textContent = 'Invalid promo code';
  }
});

document.getElementById('devotee-details-form').addEventListener('submit', (e) => {
  e.preventDefault();
  STATE.cart.devoteeDetails = {
    name: document.getElementById('dev-name').value,
    phone: document.getElementById('dev-phone').value,
    email: document.getElementById('dev-email').value,
    city: document.getElementById('dev-city').value,
    participants: parseInt(document.getElementById('dev-participants').value) || 1,
    gotra: document.getElementById('dev-gotra').value,
    requests: document.getElementById('dev-requests').value
  };
  nextWizardStep();
});

// ==========================================================================
// Step 4: Review & Payment
// ==========================================================================
function renderReviewPayPane() {
  const service = STATE.services.find(s => s.id === STATE.cart.serviceId);
  const container = document.getElementById('payment-review-details');
  if (!service) return;

  const base = service.price;
  const donation = STATE.cart.donation;
  const fee = STATE.convenienceFee;
  const tax = Math.round((base + donation + fee) * STATE.taxRate);
  let total = base + donation + fee + tax;

  // Apply promo
  if (STATE.cart.promo) {
    if (STATE.cart.promo.code === 'DEVOTE10') {
      total = Math.round(total * 0.9);
    } else if (STATE.cart.promo.code === 'FESTIVAL20') {
      total = total - 20;
    }
  }

  container.innerHTML = `
    <div><div class="review-item-label">Seva</div><div class="review-item-value">${service.name}</div></div>
    <div><div class="review-item-label">Date & Time</div><div class="review-item-value">${STATE.cart.date} at ${STATE.cart.slotTime}</div></div>
    <div><div class="review-item-label">Devotee</div><div class="review-item-value">${STATE.cart.devoteeDetails.name}</div></div>
    <div><div class="review-item-label">Phone</div><div class="review-item-value">${STATE.cart.devoteeDetails.phone}</div></div>
    <div><div class="review-item-label">Email</div><div class="review-item-value">${STATE.cart.devoteeDetails.email}</div></div>
    <div><div class="review-item-label">Participants</div><div class="review-item-value">${STATE.cart.devoteeDetails.participants}</div></div>
    <div><div class="review-item-label">Amount</div><div class="review-item-value">₹${total.toLocaleString()}</div></div>
  `;

  STATE.cart.totalAmount = total;
}

// Payment method selection
document.querySelectorAll('.payment-method-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    STATE.selectedPaymentMethod = card.getAttribute('data-method');
  });
});

// ==========================================================================
// Execute Payment & Create Booking
// ==========================================================================
async function executeMockPayment() {
  const service = STATE.services.find(s => s.id === STATE.cart.serviceId);
  if (!service) return showToast('Please select a service', 'error');

  const btn = document.getElementById('confirm-payment-btn');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing...';

  try {
    // Create booking in database
    const booking = await api('/bookings', {
      method: 'POST',
      body: {
        devotee_name: STATE.cart.devoteeDetails.name,
        phone: STATE.cart.devoteeDetails.phone,
        email: STATE.cart.devoteeDetails.email,
        city: STATE.cart.devoteeDetails.city,
        service_id: STATE.cart.serviceId,
        booking_date: STATE.cart.date,
        slot_time: STATE.cart.slotTime,
        amount: STATE.cart.totalAmount,
        priest: service.priest,
        participants: STATE.cart.devoteeDetails.participants,
        gotra: STATE.cart.devoteeDetails.gotra,
        special_requests: STATE.cart.devoteeDetails.requests
      }
    });

    STATE.currentBookingId = booking.id;

    // Simulate payment success (in production, integrate with Razorpay)
    await new Promise(r => setTimeout(r, 1500));

    // Update booking status to Confirmed
    await api(`/bookings/${booking.id}`, {
      method: 'PATCH',
      body: { status: 'Confirmed' }
    });

    // Send email notification
    await api('/notify/email', {
      method: 'POST',
      body: {
        to: STATE.cart.devoteeDetails.email,
        name: STATE.cart.devoteeDetails.name,
        bookingId: booking.id,
        sevaName: service.name,
        date: STATE.cart.date,
        time: STATE.cart.slotTime,
        amount: STATE.cart.totalAmount
      }
    });

    // Show success
    showBookingSuccess(booking, service);

  } catch (err) {
    console.error(err);
    showToast('Booking failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Confirm & Pay Booking <i data-lucide="check-circle"></i>';
  }

  lucide.createIcons();
}

function showBookingSuccess(booking, service) {
  document.querySelectorAll('.wizard-pane').forEach(p => p.style.display = 'none');
  const successPane = document.getElementById('wizard-pane-success');
  successPane.style.display = 'block';

  document.getElementById('success-booking-id').textContent = booking.id;
  document.getElementById('success-summary-name').textContent = service.name;
  document.getElementById('success-summary-datetime').textContent = `${STATE.cart.date} at ${STATE.cart.slotTime}`;
  document.getElementById('success-summary-devotee').textContent = STATE.cart.devoteeDetails.name;

  // Generate QR code placeholder
  const qrContainer = document.getElementById('success-qr-code');
  qrContainer.innerHTML = `
    <svg viewBox="0 0 100 100" style="width:100%;height:100%;">
      <rect width="100" height="100" fill="white"/>
      <text x="50" y="50" text-anchor="middle" font-size="8" fill="#706359">QR</text>
    </svg>
  `;

  generateQRCode(booking.id);
}

async function generateQRCode(bookingId) {
  // Simple QR-like pattern based on booking ID
  const qrContainer = document.getElementById('success-qr-code');
  const hash = bookingId.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);

  let svg = '<svg viewBox="0 0 100 100" style="width:100%;height:100%;"><rect width="100" height="100" fill="white"/>';
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (((hash >> (i + j)) & 1) === 1) {
        svg += `<rect x="${i * 10 + 10}" y="${j * 10 + 10}" width="8" height="8" fill="#2C2520"/>`;
      }
    }
  }
  svg += '</svg>';
  qrContainer.innerHTML = svg;
}

// Download actions
function triggerDownload(type) {
  const service = STATE.services.find(s => s.id === STATE.cart.serviceId);
  if (type === 'ticket') {
    // Call PDF endpoint
    window.open(`/api/pdf/ticket?bookingId=${STATE.currentBookingId}&sevaName=${encodeURIComponent(service.name)}&date=${STATE.cart.date}&time=${STATE.cart.slotTime}&devoteeName=${encodeURIComponent(STATE.cart.devoteeDetails.name)}&participants=${STATE.cart.devoteeDetails.participants}&priest=${encodeURIComponent(service.priest)}&gotra=${encodeURIComponent(STATE.cart.devoteeDetails.gotra || '')}`, '_blank');
  } else {
    showToast('Receipt downloaded!', 'success');
  }
}

function triggerAddToCalendar() {
  showToast('Calendar event created!', 'info');
}

function triggerWhatsAppShare() {
  const text = `My Seva booking at Sri Sidhivinayak Mandir is confirmed! Booking ID: ${STATE.currentBookingId}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function navigateToDashboard() {
  switchView('customer-dashboard');
}

// ==========================================================================
// Customer Dashboard
// ==========================================================================
async function renderCustomerDashboard() {
  await loadBookings();
  renderUpcomingBookings();
  renderBookingHistory();
  renderNotificationsList();
}

function renderUpcomingBookings() {
  const container = document.getElementById('upcoming-bookings-grid');
  const today = new Date().toISOString().split('T')[0];

  const upcoming = STATE.bookings.filter(b =>
    b.booking_date >= today && ['Confirmed', 'Pending'].includes(b.status)
  );

  if (upcoming.length === 0) {
    container.innerHTML = '<div class="card"><p style="color:var(--text-muted);">No upcoming bookings.</p></div>';
    return;
  }

  container.innerHTML = upcoming.map(b => `
    <div class="card booking-card" onclick="viewBookingDetail('${b.id}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:0.75rem;">
        <span class="booking-status-badge status-${b.status.toLowerCase()}">${b.status}</span>
        <span style="font-size:var(--fs-xs);color:var(--text-muted);">${b.id}</span>
      </div>
      <h4 style="font-size:var(--fs-md);margin-bottom:0.5rem;">${b.services?.name || 'Seva'}</h4>
      <div style="font-size:var(--fs-sm);color:var(--text-muted);">
        <div><i data-lucide="calendar" style="width:12px;"></i> ${b.booking_date}</div>
        <div><i data-lucide="clock" style="width:12px;"></i> ${b.slot_time}</div>
      </div>
      <div style="margin-top:0.75rem;font-weight:700;color:var(--primary);">₹${parseFloat(b.amount).toLocaleString()}</div>
    </div>
  `).join('');

  lucide.createIcons();
}

function renderBookingHistory() {
  const container = document.getElementById('history-bookings-grid');
  const today = new Date().toISOString().split('T')[0];

  const history = STATE.bookings.filter(b =>
    b.booking_date < today || ['Completed', 'Cancelled'].includes(b.status)
  );

  if (history.length === 0) {
    container.innerHTML = '<div class="card"><p style="color:var(--text-muted);">No booking history.</p></div>';
    return;
  }

  container.innerHTML = history.map(b => `
    <div class="card booking-card">
      <div style="display:flex;justify-content:space-between;margin-bottom:0.75rem;">
        <span class="booking-status-badge status-${b.status.toLowerCase()}">${b.status}</span>
        <span style="font-size:var(--fs-xs);color:var(--text-muted);">${b.id}</span>
      </div>
      <h4 style="font-size:var(--fs-md);margin-bottom:0.5rem;">${b.services?.name || 'Seva'}</h4>
      <div style="font-size:var(--fs-sm);color:var(--text-muted);">
        <div>${b.booking_date} at ${b.slot_time}</div>
      </div>
      <div style="margin-top:0.75rem;font-weight:700;">₹${parseFloat(b.amount).toLocaleString()}</div>
    </div>
  `).join('');
}

function renderNotificationsList() {
  const container = document.getElementById('notifications-list-container');
  if (STATE.notifications.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">No notifications.</p>';
    return;
  }
  container.innerHTML = STATE.notifications.map(n => `
    <div style="padding:1rem;border-radius:var(--border-radius-md);background:${n.is_read ? 'var(--bg-muted)' : '#FFF3EB'};">
      <div style="font-weight:600;margin-bottom:0.25rem;">${n.title}</div>
      <div style="font-size:var(--fs-sm);color:var(--text-muted);">${n.description || ''}</div>
      <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:0.5rem;">${new Date(n.notification_time).toLocaleString()}</div>
    </div>
  `).join('');
}

// Dashboard tab switching
document.querySelectorAll('#cust-dashboard-tabs .dashboard-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#cust-dashboard-tabs .dashboard-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('#cust-dashboard-tab-content .tab-pane').forEach(p => p.style.display = 'none');
    document.getElementById(`cust-tab-${tab.getAttribute('data-tab')}`).style.display = 'block';
  });
});

// ==========================================================================
// Admin Portal
// ==========================================================================
async function renderAdminPortal() {
  // Check if admin is logged in
  if (!STATE.adminToken) {
    showAdminLoginForm();
    return;
  }

  // Verify session (skip if we just logged in successfully)
  if (!STATE.adminUser) {
    const isValid = await checkAdminSession();
    if (!isValid) {
      showAdminLoginForm();
      return;
    }
  }

  // Load data and render
  await Promise.all([loadServices(), loadPriests(), loadBookings(), loadAdminSettings()]);
  await loadAdminStats();
  await renderAdminBookingsTable();
  renderAdminServicesList();
  renderAdminPriestsGrid();
  renderAdminInventoryCalendar();
  loadAdminAuditLogs();
}

function showAdminLoginForm() {
  // Hide all admin tab panes and show login form inside admin-tabs-content
  const tabsContent = document.getElementById('admin-tabs-content');
  const allPanes = tabsContent.querySelectorAll('.admin-tab-pane');

  // Hide all tab panes
  allPanes.forEach(pane => pane.style.display = 'none');

  // Create or show login form
  let loginPane = document.getElementById('admin-login-pane');
  if (!loginPane) {
    loginPane = document.createElement('div');
    loginPane.id = 'admin-login-pane';
    loginPane.className = 'admin-tab-pane active';
    loginPane.innerHTML = `
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h2 class="spiritual-title" style="color: var(--primary); margin-bottom: 1.5rem; text-align: center;">Admin Login</h2>
        <form id="admin-login-form" onsubmit="event.preventDefault(); handleAdminLoginSubmit();">
          <div class="form-group">
            <label class="form-label" for="admin-email">Email</label>
            <input type="email" id="admin-email" class="form-control" required value="claude1@chanakya.icu">
          </div>
          <div class="form-group">
            <label class="form-label" for="admin-password">Password</label>
            <input type="password" id="admin-password" class="form-control" required value="admin123">
          </div>
          <button type="submit" class="btn btn-primary btn-block" style="margin-top: 1rem;">
            <i data-lucide="log-in" style="width: 16px;"></i> Login
          </button>
        </form>
        <p style="margin-top: 1rem; font-size: var(--fs-xs); color: var(--text-muted); text-align: center;">
          Default: claude1@chanakya.icu / admin123
        </p>
      </div>
    `;
    tabsContent.appendChild(loginPane);
  }

  loginPane.style.display = 'block';

  // Remove active from sidebar links
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  lucide.createIcons();
}

async function handleAdminLoginSubmit() {
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  const success = await adminLogin(email, password);
  if (success) {
    // Hide login pane and show admin tabs
    const loginPane = document.getElementById('admin-login-pane');
    if (loginPane) loginPane.style.display = 'none';

    // Show dashboard tab and set first sidebar link active
    document.getElementById('admin-tab-dashboard').style.display = 'block';
    document.querySelector('.sidebar-link[data-admin-tab="dashboard"]').classList.add('active');

    // Now load admin data
    await renderAdminPortal();
    lucide.createIcons();
  }
}

async function loadAdminAuditLogs() {
  try {
    const logs = await api('/admin/logs?limit=10');
    // Could render logs in a separate section if needed
    console.log('Recent admin activity:', logs);
  } catch (err) {
    console.error('Failed to load audit logs:', err);
  }
}

// Verify booking
async function verifyBookingManualLookup() {
  const bookingId = document.getElementById('admin-verify-search-input').value.trim();
  if (!bookingId) {
    showToast('Please enter a booking ID', 'error');
    return;
  }

  try {
    const result = await api(`/admin/verify/${bookingId}`);
    const box = document.getElementById('scan-results-box');
    box.style.display = 'block';

    if (result.verification.valid) {
      box.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
          <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--status-confirmed); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="check" style="color: white; width: 24px;"></i>
          </div>
          <div>
            <div style="font-size: var(--fs-lg); font-weight: 700; color: var(--status-confirmed-text);">Valid Booking</div>
            <div style="font-size: var(--fs-sm); color: var(--text-muted);">Entry permitted</div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: var(--fs-sm);">
          <div><strong>Devotee:</strong> ${result.booking.devotee_name}</div>
          <div><strong>Seva:</strong> ${result.booking.services?.name || 'N/A'}</div>
          <div><strong>Date:</strong> ${result.booking.booking_date}</div>
          <div><strong>Time:</strong> ${result.booking.slot_time}</div>
          <div><strong>Participants:</strong> ${result.booking.participants}</div>
          <div><strong>Email:</strong> ${result.booking.email}</div>
        </div>
      `;
    } else {
      box.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
          <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--status-cancelled); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="x" style="color: white; width: 24px;"></i>
          </div>
          <div>
            <div style="font-size: var(--fs-lg); font-weight: 700; color: var(--status-cancelled-text);">Invalid Booking</div>
            <div style="font-size: var(--fs-sm); color: var(--text-muted);">${result.verification.message}</div>
          </div>
        </div>
      `;
    }

    lucide.createIcons();
  } catch (err) {
    showToast('Booking not found or invalid', 'error');
  }
}

async function loadAdminStats() {
  try {
    const stats = await api('/stats');
    document.getElementById('kpi-total-bookings').textContent = stats.totalBookings?.toLocaleString() || '0';
    document.getElementById('kpi-today-bookings').textContent = stats.todayBookings || '0';
    document.getElementById('kpi-revenue').textContent = `₹${stats.grossRevenue?.toLocaleString() || '0'}`;
    document.getElementById('kpi-upcoming').textContent = stats.upcomingSevas || '0';
    document.getElementById('kpi-utilization').textContent = `${stats.utilization || 0}%`;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }

  // Render charts
  await renderDailyBookingsChart();
  await renderServicePopularityChart();
}

async function renderDailyBookingsChart() {
  const container = document.getElementById('daily-bookings-chart');
  try {
    const data = await api(`/chart/daily-bookings?month=${STATE.currentMonth + 1}&year=${STATE.currentYear}`);
    const maxCount = Math.max(...data.map(d => d.count), 1);

    const svg = `<svg viewBox="0 0 300 150" style="width:100%;height:100%;">
      <g transform="translate(0, 10)">
        ${data.map((d, i) => {
          const x = (i / data.length) * 280 + 10;
          const h = (d.count / maxCount) * 120;
          return `<rect x="${x}" y="${130 - h}" width="6" height="${h}" fill="var(--primary)" rx="2"/>`;
        }).join('')}
      </g>
    </svg>`;

    container.innerHTML = svg;
  } catch (err) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Chart loading...</p>';
  }
}

async function renderServicePopularityChart() {
  const container = document.getElementById('popular-services-chart');
  try {
    const data = await api('/chart/service-popularity');
    const maxCount = Math.max(...data.map(d => d.count), 1);

    const total = data.reduce((sum, d) => sum + d.count, 0);
    let offset = 0;

    const colors = ['#E35205', '#D4AF37', '#E6A15C', '#FF7D3C', '#A83A00', '#9A7B1C'];

    const svg = `<svg viewBox="0 0 200 200" style="width:100%;height:100%;">
      <g transform="translate(100,100)">
        ${data.slice(0, 6).map((d, i) => {
          const pct = total > 0 ? d.count / total : 0;
          const r = 80;
          const circumference = 2 * Math.PI * r;
          const len = pct * circumference;
          const stroke = colors[i % colors.length];
          const dash = `${len} ${circumference - len}`;
          const rotate = offset * 360;
          offset += pct;
          return `<circle r="${r}" fill="none" stroke="${stroke}" stroke-width="30" stroke-dasharray="${dash}" transform="rotate(${rotate - 90})"/>`;
        }).join('')}
      </g>
    </svg>`;

    container.innerHTML = svg;
  } catch (err) {
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Chart loading...</p>';
  }
}

async function renderAdminBookingsTable() {
  const tbody = document.getElementById('admin-bookings-tbody');

  if (STATE.bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No bookings found</td></tr>';
    return;
  }

  tbody.innerHTML = STATE.bookings.map(b => `
    <tr>
      <td><input type="checkbox" class="row-checkbox" data-id="${b.id}"></td>
      <td>${b.id}</td>
      <td>${b.devotee_name}</td>
      <td>${b.services?.name || 'N/A'}</td>
      <td>${b.priest}</td>
      <td>${b.booking_date}<br><span style="color:var(--text-muted);">${b.slot_time}</span></td>
      <td>₹${parseFloat(b.amount).toLocaleString()}</td>
      <td><span class="booking-status-badge status-${b.status.toLowerCase()}">${b.status}</span></td>
      <td>
        <button class="btn btn-secondary" style="padding:0.4rem 0.6rem;font-size:var(--fs-xs);" onclick="openAdminDrawer('${b.id}')">
          <i data-lucide="eye" style="width:14px;"></i>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function renderAdminServicesList() {
  const container = document.getElementById('admin-services-list');
  container.innerHTML = STATE.services.map(s => `
    <div class="card service-card">
      <div class="service-card-img" style="background:${s.image_gradient || 'var(--primary)'};"></div>
      <div class="service-card-content">
        <h4>${s.name}</h4>
        <div style="font-size:var(--fs-sm);color:var(--text-muted);">
          ${s.category} · ${s.duration} · ₹${s.price}
        </div>
        <div style="margin-top:0.75rem; display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" style="padding:0.4rem 0.8rem;font-size:var(--fs-xs);" onclick="editService(${s.id})">
            <i data-lucide="edit-2" style="width:12px;"></i> Edit
          </button>
          <button class="btn btn-secondary" style="padding:0.4rem 0.8rem;font-size:var(--fs-xs); color: var(--status-cancelled-text);" onclick="deleteService(${s.id})">
            <i data-lucide="trash-2" style="width:12px;"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

// Service CRUD operations
async function editService(serviceId) {
  const service = STATE.services.find(s => s.id === serviceId);
  if (!service) return;

  showServiceModal(service);
}

function openNewServiceModal() {
  showServiceModal(null);
}

function showServiceModal(service) {
  const isEdit = !!service;
  const drawer = document.getElementById('admin-booking-drawer');
  const overlay = document.getElementById('drawer-overlay');

  document.getElementById('drawer-title').textContent = isEdit ? 'Edit Service' : 'Add New Service';
  document.getElementById('drawer-content-body').innerHTML = `
    <form id="service-edit-form" onsubmit="event.preventDefault(); saveServiceForm(${service?.id || 'null'});">
      <div class="form-group">
        <label class="form-label">Service Name</label>
        <input type="text" id="svc-name" class="form-control" required value="${service?.name || ''}" placeholder="e.g. Ganesh Pooja">
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="svc-category" class="form-control" required>
          <option value="Pooja" ${service?.category === 'Pooja' ? 'selected' : ''}>Pooja</option>
          <option value="Ritual" ${service?.category === 'Ritual' ? 'selected' : ''}>Ritual</option>
          <option value="Ceremony" ${service?.category === 'Ceremony' ? 'selected' : ''}>Ceremony</option>
          <option value="VIP Darshan" ${service?.category === 'VIP Darshan' ? 'selected' : ''}>VIP Darshan</option>
          <option value="Festival Service" ${service?.category === 'Festival Service' ? 'selected' : ''}>Festival Service</option>
          <option value="Group Booking" ${service?.category === 'Group Booking' ? 'selected' : ''}>Group Booking</option>
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Duration</label>
          <input type="text" id="svc-duration" class="form-control" value="${service?.duration || ''}" placeholder="e.g. 45 mins">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Price (₹)</label>
          <input type="number" id="svc-price" class="form-control" required value="${service?.price || ''}" placeholder="e.g. 501">
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Priest</label>
          <input type="text" id="svc-priest" class="form-control" value="${service?.priest || ''}" placeholder="e.g. Pandit Shastri">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Max Slots</label>
          <input type="number" id="svc-slots" class="form-control" value="${service?.max_slots || 10}" placeholder="10">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Image Gradient (CSS)</label>
        <input type="text" id="svc-gradient" class="form-control" value="${service?.image_gradient || ''}" placeholder="linear-gradient(135deg, #FF9933 0%, #FF5500 100%)">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="svc-description" class="form-control" rows="2" placeholder="Service description...">${service?.description || ''}</textarea>
      </div>
      <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
        <div class="checkbox-group">
          <input type="checkbox" id="svc-popular" ${service?.is_popular ? 'checked' : ''}>
          <label for="svc-popular">Mark as Popular</label>
        </div>
        <div class="checkbox-group">
          <input type="checkbox" id="svc-recommended" ${service?.is_recommended ? 'checked' : ''}>
          <label for="svc-recommended">Mark as Recommended</label>
        </div>
      </div>
    </form>
  `;

  document.getElementById('drawer-footer-actions').innerHTML = `
    <button class="btn btn-primary btn-block" onclick="document.getElementById('service-edit-form').dispatchEvent(new Event('submit'));">
      ${isEdit ? 'Update Service' : 'Create Service'}
    </button>
  `;

  overlay.classList.add('active');
  drawer.classList.add('active');
  lucide.createIcons();
}

async function saveServiceForm(serviceId) {
  const data = {
    name: document.getElementById('svc-name').value,
    category: document.getElementById('svc-category').value,
    duration: document.getElementById('svc-duration').value,
    price: document.getElementById('svc-price').value,
    priest: document.getElementById('svc-priest').value,
    max_slots: document.getElementById('svc-slots').value,
    image_gradient: document.getElementById('svc-gradient').value,
    description: document.getElementById('svc-description').value,
    is_popular: document.getElementById('svc-popular').checked,
    is_recommended: document.getElementById('svc-recommended').checked
  };

  try {
    if (serviceId) {
      await api(`/admin/services/${serviceId}`, { method: 'PATCH', body: data });
      showToast('Service updated successfully!', 'success');
    } else {
      await api('/admin/services', { method: 'POST', body: data });
      showToast('Service created successfully!', 'success');
    }
    closeAdminDrawer();
    await loadServices();
    renderAdminServicesList();
  } catch (err) {
    showToast('Failed to save service: ' + err.message, 'error');
  }
}

async function deleteService(serviceId) {
  if (!confirm('Are you sure you want to delete this service? This action cannot be undone.')) return;

  try {
    await api(`/admin/services/${serviceId}`, { method: 'DELETE' });
    showToast('Service deleted successfully!', 'success');
    await loadServices();
    renderAdminServicesList();
  } catch (err) {
    showToast('Failed to delete service: ' + err.message, 'error');
  }
}

function renderAdminPriestsGrid() {
  const container = document.getElementById('admin-priests-grid');
  container.innerHTML = STATE.priests.map(p => `
    <div class="card">
      <div style="display:flex;align-items:center;gap:1rem;">
        <div style="width:50px;height:50px;border-radius:50%;background:var(--bg-muted);display:flex;align-items:center;justify-content:center;">
          <i data-lucide="user" style="color:var(--primary);"></i>
        </div>
        <div style="flex: 1;">
          <h4 style="margin-bottom:0.25rem;">${p.name}</h4>
          <div style="font-size:var(--fs-xs);color:var(--text-muted);">${p.specialty}</div>
          <div style="font-size:var(--fs-xs);margin-top:0.25rem;">
            <span class="booking-status-badge status-${p.status === 'Available' ? 'confirmed' : 'pending'}">${p.status}</span>
            <span style="margin-left:0.5rem;"><i data-lucide="star" style="width:12px;color:var(--secondary);"></i> ${p.ratings}</span>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" style="padding:0.4rem 0.6rem;font-size:var(--fs-xs);" onclick="editPriest(${p.id})">
            <i data-lucide="edit-2" style="width:12px;"></i>
          </button>
          <button class="btn btn-secondary" style="padding:0.4rem 0.6rem;font-size:var(--fs-xs); color: var(--status-cancelled-text);" onclick="deletePriest(${p.id})">
            <i data-lucide="trash-2" style="width:12px;"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function openNewPriestModal() {
  showPriestModal(null);
}

function editPriest(priestId) {
  const priest = STATE.priests.find(p => p.id === priestId);
  if (!priest) return;
  showPriestModal(priest);
}

function showPriestModal(priest) {
  const isEdit = !!priest;
  const drawer = document.getElementById('admin-booking-drawer');
  const overlay = document.getElementById('drawer-overlay');

  document.getElementById('drawer-title').textContent = isEdit ? 'Edit Priest' : 'Register Priest';
  document.getElementById('drawer-content-body').innerHTML = `
    <form id="priest-edit-form" onsubmit="event.preventDefault(); savePriestForm(${priest?.id || 'null'});">
      <div class="form-group">
        <label class="form-label">Priest Name</label>
        <input type="text" id="priest-name" class="form-control" required value="${priest?.name || ''}" placeholder="e.g. Pandit Sharma">
      </div>
      <div class="form-group">
        <label class="form-label">Specialty</label>
        <input type="text" id="priest-specialty" class="form-control" value="${priest?.specialty || ''}" placeholder="e.g. Abhishek & Poojas">
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Status</label>
          <select id="priest-status" class="form-control">
            <option value="Available" ${priest?.status === 'Available' ? 'selected' : ''}>Available</option>
            <option value="Active" ${priest?.status === 'Active' ? 'selected' : ''}>Active</option>
            <option value="On Leave" ${priest?.status === 'On Leave' ? 'selected' : ''}>On Leave</option>
            <option value="Unavailable" ${priest?.status === 'Unavailable' ? 'selected' : ''}>Unavailable</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Ratings</label>
          <input type="number" id="priest-ratings" class="form-control" value="${priest?.ratings || 4.5}" min="0" max="5" step="0.1" placeholder="4.5">
        </div>
      </div>
    </form>
  `;

  document.getElementById('drawer-footer-actions').innerHTML = `
    <button class="btn btn-primary btn-block" onclick="document.getElementById('priest-edit-form').dispatchEvent(new Event('submit'));">
      ${isEdit ? 'Update Priest' : 'Register Priest'}
    </button>
  `;

  overlay.classList.add('active');
  drawer.classList.add('active');
  lucide.createIcons();
}

async function savePriestForm(priestId) {
  const data = {
    name: document.getElementById('priest-name').value,
    specialty: document.getElementById('priest-specialty').value,
    status: document.getElementById('priest-status').value,
    ratings: document.getElementById('priest-ratings').value
  };

  try {
    if (priestId) {
      await api(`/admin/priests/${priestId}`, { method: 'PATCH', body: data });
      showToast('Priest updated successfully!', 'success');
    } else {
      await api('/admin/priests', { method: 'POST', body: data });
      showToast('Priest registered successfully!', 'success');
    }
    closeAdminDrawer();
    await loadPriests();
    renderAdminPriestsGrid();
  } catch (err) {
    showToast('Failed to save priest: ' + err.message, 'error');
  }
}

async function deletePriest(priestId) {
  if (!confirm('Are you sure you want to remove this priest?')) return;

  try {
    await api(`/admin/priests/${priestId}`, { method: 'DELETE' });
    showToast('Priest removed successfully!', 'success');
    await loadPriests();
    renderAdminPriestsGrid();
  } catch (err) {
    showToast('Failed to remove priest: ' + err.message, 'error');
  }
}

// Bulk actions
async function executeBulkAction(action) {
  const checkboxes = document.querySelectorAll('.row-checkbox:checked');
  const bookingIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-id'));

  if (bookingIds.length === 0) {
    showToast('Please select at least one booking', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to ${action} ${bookingIds.length} booking(s)?`)) return;

  try {
    await api('/admin/bookings/bulk-update', {
      method: 'POST',
      body: { bookingIds, action }
    });
    showToast(`Successfully ${action}d ${bookingIds.length} booking(s)`, 'success');
    document.getElementById('bulk-actions-panel').style.display = 'none';
    document.getElementById('table-select-all').checked = false;
    await loadBookings();
    renderAdminBookingsTable();
  } catch (err) {
    showToast('Bulk action failed: ' + err.message, 'error');
  }
}

async function renderAdminInventoryCalendar() {
  const grid = document.getElementById('admin-inventory-grid');
  await loadInventory(STATE.adminInvMonth, STATE.adminInvYear);

  const monthLabel = document.getElementById('admin-inv-month');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  monthLabel.textContent = `${monthNames[STATE.adminInvMonth]} ${STATE.adminInvYear}`;

  const date = new Date(STATE.adminInvYear, STATE.adminInvMonth, 1);
  const firstDay = date.getDay();
  const daysInMonth = new Date(STATE.adminInvYear, STATE.adminInvMonth + 1, 0).getDate();

  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += '<div class="inventory-day-card disabled" style="opacity:0.3;"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${STATE.adminInvYear}-${String(STATE.adminInvMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const inv = STATE.inventory[dateStr] || { capacity: 50, type: 'Normal' };
    const isSelected = STATE.selectedAdminInvDate === dateStr;

    grid.innerHTML += `
      <div class="inventory-day-card ${isSelected ? 'active' : ''} ${inv.type === 'Closed' ? 'disabled' : ''}"
           onclick="selectInventoryDate('${dateStr}')"
           style="${inv.type === 'Festival' ? 'border-color:var(--secondary);background:#FFFDF0;' : ''}">
        <div class="inventory-day-num">${d}</div>
        <div class="inventory-day-slots">${inv.type === 'Closed' ? 'CLOSED' : `${inv.capacity} slots`}</div>
        ${inv.festivalName ? `<div style="font-size:8px;color:var(--secondary-dark);">${inv.festivalName}</div>` : ''}
      </div>
    `;
  }

  lucide.createIcons();
}

function selectInventoryDate(dateStr) {
  STATE.selectedAdminInvDate = dateStr;
  const inv = STATE.inventory[dateStr] || { capacity: 50, type: 'Normal', festivalName: '', waitlistEnabled: false };

  document.getElementById('selected-inv-date-label').textContent = dateStr;
  document.getElementById('inv-capacity').value = inv.capacity;
  document.getElementById('inv-type').value = inv.type;
  document.getElementById('inv-festival-name').value = inv.festivalName || '';
  document.getElementById('inv-waitlist-enable').checked = inv.waitlistEnabled;
  document.getElementById('save-inv-btn').disabled = false;

  renderAdminInventoryCalendar();
}

async function saveInventoryDetails() {
  if (!STATE.selectedAdminInvDate) return;

  try {
    await api('/inventory', {
      method: 'POST',
      body: {
        date: STATE.selectedAdminInvDate,
        capacity: document.getElementById('inv-capacity').value,
        day_type: document.getElementById('inv-type').value,
        festival_name: document.getElementById('inv-festival-name').value,
        waitlist_enabled: document.getElementById('inv-waitlist-enable').checked
      }
    });
    showToast('Inventory updated!', 'success');
    await loadInventory(STATE.adminInvMonth, STATE.adminInvYear);
    renderAdminInventoryCalendar();
  } catch (err) {
    showToast('Failed to update inventory', 'error');
  }
}

function navigateAdminInvMonth(delta) {
  STATE.adminInvMonth += delta;
  if (STATE.adminInvMonth < 0) { STATE.adminInvMonth = 11; STATE.adminInvYear--; }
  if (STATE.adminInvMonth > 11) { STATE.adminInvMonth = 0; STATE.adminInvYear++; }
  renderAdminInventoryCalendar();
}

// Admin sidebar tab switching
document.querySelectorAll('.sidebar-link').forEach(link => {
  link.addEventListener('click', async () => {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');
    const tabName = link.getAttribute('data-admin-tab');
    document.getElementById(`admin-tab-${tabName}`).style.display = 'block';

    // Load settings when settings tab is opened
    if (tabName === 'settings') {
      await renderAdminSettingsForm();
    }

    lucide.createIcons();
  });
});

// Admin drawer
function openAdminDrawer(bookingId) {
  STATE.selectedAdminBookingId = bookingId;
  const booking = STATE.bookings.find(b => b.id === bookingId);
  if (!booking) return;

  document.getElementById('drawer-title').textContent = `Booking: ${bookingId}`;
  document.getElementById('drawer-content-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div><strong>Devotee:</strong> ${booking.devotee_name}</div>
      <div><strong>Phone:</strong> ${booking.phone}</div>
      <div><strong>Email:</strong> ${booking.email}</div>
      <div><strong>Service:</strong> ${booking.services?.name || 'N/A'}</div>
      <div><strong>Date:</strong> ${booking.booking_date}</div>
      <div><strong>Time:</strong> ${booking.slot_time}</div>
      <div><strong>Amount:</strong> ₹${parseFloat(b.amount).toLocaleString()}</div>
      <div><strong>Status:</strong> <span class="booking-status-badge status-${booking.status.toLowerCase()}">${booking.status}</span></div>
      <div><strong>Priest:</strong> ${booking.priest}</div>
      <div><strong>Participants:</strong> ${booking.participants}</div>
      ${booking.gotra ? `<div><strong>Gotra:</strong> ${booking.gotra}</div>` : ''}
      ${booking.special_requests ? `<div><strong>Requests:</strong> ${booking.special_requests}</div>` : ''}
    </div>
  `;

  document.getElementById('drawer-footer-actions').innerHTML = `
    ${booking.status === 'Pending' ? `<button class="btn btn-primary btn-block" onclick="updateBookingStatus('${bookingId}', 'Confirmed')">Approve Booking</button>` : ''}
    ${booking.status !== 'Cancelled' ? `<button class="btn btn-secondary btn-block" onclick="updateBookingStatus('${bookingId}', 'Cancelled')">Cancel Booking</button>` : ''}
    ${booking.status === 'Confirmed' ? `<button class="btn btn-gold btn-block" onclick="updateBookingStatus('${bookingId}', 'Completed')">Mark Completed</button>` : ''}
  `;

  document.getElementById('drawer-overlay').classList.add('active');
  document.getElementById('admin-booking-drawer').classList.add('active');
  lucide.createIcons();
}

function closeAdminDrawer() {
  document.getElementById('drawer-overlay').classList.remove('active');
  document.getElementById('admin-booking-drawer').classList.remove('active');
}

async function updateBookingStatus(bookingId, status) {
  try {
    await api(`/bookings/${bookingId}`, {
      method: 'PATCH',
      body: { status }
    });
    showToast(`Booking ${status.toLowerCase()}`, 'success');
    closeAdminDrawer();
    await loadBookings();
    renderAdminBookingsTable();
  } catch (err) {
    showToast('Failed to update booking', 'error');
  }
}

// Admin filters
function applyAdminFilters() {
  const search = document.getElementById('admin-table-search').value;
  const status = document.getElementById('admin-filter-status').value;
  const category = document.getElementById('admin-filter-category').value;

  loadBookings({ status: status !== 'all' ? status : '', search }).then(() => {
    renderAdminBookingsTable();
  });
}

// Report generation
function generateMockReport() {
  document.getElementById('report-view-area').style.display = 'block';
  document.getElementById('report-view-area').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:1rem;">
      <h4>Financial Settlement Ledger</h4>
      <button class="btn btn-secondary" onclick="triggerDownload('report')">Export</button>
    </div>
    <div style="background:var(--bg-muted);padding:1rem;border-radius:var(--border-radius-md);">
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border-color);padding:0.5rem 0;">
        <span>Total Confirmed Bookings</span>
        <span>${STATE.bookings.filter(b => b.status === 'Confirmed').length}</span>
      </div>
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border-color);padding:0.5rem 0;">
        <span>Gross Revenue</span>
        <span>₹${STATE.bookings.filter(b => ['Confirmed', 'Completed'].includes(b.status)).reduce((s, b) => s + parseFloat(b.amount), 0).toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;">
        <span>Pending Settlements</span>
        <span>${STATE.bookings.filter(b => b.status === 'Pending').length}</span>
      </div>
    </div>
  `;
}

// Admin settings management
async function renderAdminSettingsForm() {
  const settings = await loadAdminSettings();
  if (!settings) return;

  document.getElementById('setting-temple-name').value = settings.temple_name || '';
  document.getElementById('setting-whatsapp-template').value = settings.whatsapp_template || '';
  document.getElementById('setting-convenience-fee').value = settings.convenience_fee || 20;
  document.getElementById('setting-tax-rate').value = settings.tax_rate || 5;
  document.getElementById('setting-max-advance-days').value = settings.max_booking_advance_days || 90;
  document.getElementById('setting-cancellation-hours').value = settings.cancellation_hours || 24;
  document.getElementById('setting-email-notif').checked = settings.enable_email_notifications !== false;
  document.getElementById('setting-sms-notif').checked = settings.enable_sms_notifications === true;
  document.getElementById('setting-whatsapp-notif').checked = settings.enable_whatsapp_notifications !== false;

  if (STATE.adminUser) {
    document.getElementById('admin-user-display').textContent = STATE.adminUser.email;
  }
}

async function saveAllAdminSettings() {
  const settingsToSave = [
    { key: 'temple_name', value: document.getElementById('setting-temple-name').value },
    { key: 'whatsapp_template', value: document.getElementById('setting-whatsapp-template').value },
    { key: 'convenience_fee', value: document.getElementById('setting-convenience-fee').value },
    { key: 'tax_rate', value: document.getElementById('setting-tax-rate').value },
    { key: 'max_booking_advance_days', value: document.getElementById('setting-max-advance-days').value },
    { key: 'cancellation_hours', value: document.getElementById('setting-cancellation-hours').value },
    { key: 'enable_email_notifications', value: document.getElementById('setting-email-notif').checked },
    { key: 'enable_sms_notifications', value: document.getElementById('setting-sms-notif').checked },
    { key: 'enable_whatsapp_notifications', value: document.getElementById('setting-whatsapp-notif').checked }
  ];

  try {
    for (const setting of settingsToSave) {
      await api(`/admin/settings/${setting.key}`, {
        method: 'PATCH',
        body: { value: setting.value }
      });
    }
    showToast('All settings saved successfully!', 'success');
    await loadAdminSettings();
  } catch (err) {
    showToast('Failed to save settings: ' + err.message, 'error');
  }
}

function handleAdminLogout() {
  adminLogout();
  switchView('customer-booking-flow');
}

// ==========================================================================
// Initialize Application
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Load initial data
  await loadServices();
  await loadPriests();

  // Check for admin session
  await checkAdminSession();

  // Initial view
  updateWizardDisplay();
});
