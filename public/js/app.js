document.addEventListener('DOMContentLoaded', () => {
  const normalizeName = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizePhone = (value) => value.replace(/\D/g, '').trim();
  const root = document.documentElement;
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const themeToggleText = document.querySelector('.theme-toggle-text');
  const themeToggleIcon = document.querySelector('.theme-toggle-icon');
  const searchInput = document.querySelector('[data-attendee-search]');
  const attendeeItems = Array.from(document.querySelectorAll('[data-attendee-item]'));
  const attendeeEmpty = document.querySelector('[data-attendee-empty]');
  const attendeeForms = Array.from(document.querySelectorAll('[data-attendee-form]'));
  const downloadCardButton = document.querySelector('[data-download-card]');
  const shareCard = document.querySelector('[data-share-card]');
  const adminSearchInputs = Array.from(document.querySelectorAll('[data-admin-search]'));
  const adminTabsContainer = document.querySelector('[data-admin-tabs]');

  const updateThemeToggle = () => {
    if (!themeToggle || !themeToggleText || !themeToggleIcon) {
      return;
    }

    const isLight = root.classList.contains('light-theme');
    themeToggleText.textContent = isLight ? 'Dark' : 'Light';
    themeToggleIcon.textContent = isLight ? '🌙' : '☀️';
    themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  };

  if (themeToggle) {
    updateThemeToggle();
    themeToggle.addEventListener('click', () => {
      const isLight = root.classList.toggle('light-theme');

      try {
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
      } catch (error) {
        console.warn('Unable to save theme preference.', error);
      }

      updateThemeToggle();
    });
  }

  if (searchInput && attendeeItems.length) {
    const filterItems = () => {
      const query = searchInput.value.trim().toLowerCase();
      let visibleCount = 0;

      attendeeItems.forEach((item) => {
        const name = item.dataset.name || '';
        const matches = name.includes(query);
        item.classList.toggle('hidden', !matches);
        if (matches) {
          visibleCount += 1;
        }
      });

      if (attendeeEmpty) {
        attendeeEmpty.classList.toggle('hidden', visibleCount !== 0);
      }
    };

    searchInput.addEventListener('input', filterItems);
    filterItems();
  }

  if (adminSearchInputs.length) {
    adminSearchInputs.forEach((input) => {
      const type = input.dataset.adminSearch;
      const listItems = Array.from(document.querySelectorAll(`[data-admin-item="${type}"]`));
      const emptyState = document.querySelector(`[data-admin-empty="${type}"]`);

      const filterAdminItems = () => {
        const query = input.value.trim().toLowerCase();
        let visibleCount = 0;

        listItems.forEach((item) => {
          const name = item.dataset.name || '';
          const matches = name.includes(query);
          item.classList.toggle('hidden', !matches);

          if (matches) {
            visibleCount += 1;
          }
        });

        if (emptyState) {
          emptyState.classList.toggle('hidden', visibleCount !== 0 || query.length === 0);
        }
      };

      input.addEventListener('input', filterAdminItems);
      filterAdminItems();
    });
  }

  if (adminTabsContainer) {
    const tabButtons = Array.from(adminTabsContainer.querySelectorAll('[data-admin-tab-button]'));
    const tabPanels = Array.from(document.querySelectorAll('[data-admin-tab-panel]'));
    const defaultTab = adminTabsContainer.dataset.defaultAdminTab || 'attendance';

    const setActiveTab = (tabName) => {
      tabButtons.forEach((button) => {
        const isActive = button.dataset.adminTabButton === tabName;
        button.classList.toggle('bg-brand-500', isActive);
        button.classList.toggle('text-slate-950', isActive);
        button.classList.toggle('bg-white/5', !isActive);
        button.classList.toggle('text-slate-300', !isActive);
      });

      tabPanels.forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.adminTabPanel !== tabName);
      });
    };

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setActiveTab(button.dataset.adminTabButton);
      });
    });

    setActiveTab(defaultTab);
  }

  if (attendeeForms.length) {
    attendeeForms.forEach((attendeeForm) => {
      const attendeeMessage = attendeeForm.querySelector('[data-attendee-message]');

      if (!attendeeMessage) {
        return;
      }

      attendeeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        attendeeMessage.textContent = 'Submitting...';
        attendeeMessage.className = 'mt-4 text-sm text-brand-200';

        const formData = new FormData(attendeeForm);
        const payload = Object.fromEntries(formData.entries());
        const duplicateEntry = attendeeItems.find((item) => {
          const existingName = normalizeName(item.dataset.name || '');
          const existingPhone = normalizePhone(item.dataset.phone || '');

          return existingName === normalizeName(String(payload.name || '')) || existingPhone === normalizePhone(String(payload.phone || ''));
        });

        if (duplicateEntry) {
          attendeeMessage.textContent = 'Name and mobile number must both be unique. Duplicate entry is not allowed.';
          attendeeMessage.className = 'mt-4 text-sm text-rose-300';
          return;
        }

        try {
          const response = await fetch('/api/attendees', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          const result = await response.json();
          attendeeMessage.textContent = result.message;
          attendeeMessage.className = `mt-4 text-sm ${result.ok ? 'text-emerald-300' : 'text-rose-300'}`;

          if (result.ok) {
            attendeeForm.reset();
            window.setTimeout(() => window.location.reload(), 900);
          }
        } catch (error) {
          attendeeMessage.textContent = 'Something went wrong. Please try again.';
          attendeeMessage.className = 'mt-4 text-sm text-rose-300';
        }
      });
    });
  }

  if (downloadCardButton && shareCard) {
    downloadCardButton.addEventListener('click', async () => {
      const originalText = downloadCardButton.textContent;
      downloadCardButton.disabled = true;
      downloadCardButton.textContent = 'Preparing...';

      try {
        if (typeof window.html2canvas !== 'function') {
          throw new Error('Download library not loaded');
        }

        const canvas = await window.html2canvas(shareCard, {
          scale: 2,
          backgroundColor: null,
          useCORS: true,
        });

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `cba14-iftar-card-${new Date().toISOString().slice(0, 10)}.png`;
        link.click();

        downloadCardButton.textContent = 'Downloaded';
      } catch (error) {
        console.error(error);
        downloadCardButton.textContent = 'Download Failed';
      } finally {
        window.setTimeout(() => {
          downloadCardButton.disabled = false;
          downloadCardButton.textContent = originalText;
        }, 1400);
      }
    });
  }

});
