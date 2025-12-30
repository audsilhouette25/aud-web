/**
 * Tutorial System for AUD
 * Step-based onboarding for new users
 */

(function() {
  'use strict';

  // Tutorial steps configuration
  const STEPS = [
    {
      selector: '.menu a[href="./collect.html"]',
      text: 'Register new aud:',
      pos: 'bottom'
    },
    {
      selector: '.menu a[href="./gallery.html"]',
      text: 'Browse all aud:',
      pos: 'bottom'
    },
    {
      selector: '.menu a[href="./custom.html"]',
      text: 'Customize your aud: container',
      pos: 'bottom'
    },
    {
      selector: '.menu a[href="./game.html"]',
      text: 'Play sound-related games with aud:',
      pos: 'bottom'
    },
    {
      selector: '.panel.kpi-box:nth-child(1)',
      text: 'Number of posts you\'ve created',
      pos: 'bottom'
    },
    {
      selector: '.panel.kpi-box:nth-child(2)',
      text: 'Number of votes on your feed posts',
      pos: 'bottom'
    },
    {
      selector: '.panel.rate-box',
      text: 'Match rate between votes received and your actual label',
      pos: 'bottom'
    },
    {
      selector: '.quick .panel:first-child',
      text: 'Your collection summary: aud:, Jibbitz, and posts',
      pos: 'bottom'
    },
    {
      selector: '.panel.lab',
      text: 'Draw sounds! Your artwork can become a new aud:',
      pos: 'top'
    }
  ];

  const STORAGE_KEY = 'aud:tutorial-done';
  let currentStep = 0;
  let overlay = null;
  let tooltip = null;
  let isActive = false;

  // Check if tutorial should run
  function shouldRunTutorial() {
    // For development: always run (comment out for production)
    return true;

    // For production: only run for first-time users
    // return !localStorage.getItem(STORAGE_KEY);
  }

  // Create overlay element
  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.addEventListener('click', nextStep);
    document.body.appendChild(overlay);
  }

  // Create tooltip element
  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'tutorial-tooltip';
    tooltip.innerHTML = `
      <div class="tutorial-content"></div>
      <div class="tutorial-footer">
        <button class="tutorial-skip">Skip</button>
        <span class="tutorial-step"></span>
        <button class="tutorial-next">Next</button>
      </div>
    `;

    tooltip.querySelector('.tutorial-next').addEventListener('click', (e) => {
      e.stopPropagation();
      nextStep();
    });

    tooltip.querySelector('.tutorial-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      endTutorial();
    });

    document.body.appendChild(tooltip);
  }

  // Position tooltip relative to target element
  function positionTooltip(target, pos) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 16;

    let top, left;

    switch (pos) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'top':
        top = rect.top - tooltipRect.height - gap;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
        left = rect.left - tooltipRect.width - gap;
        break;
      case 'right':
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
        left = rect.right + gap;
        break;
      default:
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    }

    // Keep tooltip within viewport
    const padding = 16;
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    tooltip.setAttribute('data-pos', pos);
  }

  // Show current step
  function showStep() {
    if (currentStep >= STEPS.length) {
      endTutorial();
      return;
    }

    const step = STEPS[currentStep];
    const target = document.querySelector(step.selector);

    if (!target) {
      currentStep++;
      showStep();
      return;
    }

    // Remove previous highlight
    document.querySelectorAll('[data-tutorial-active]').forEach(el => {
      el.removeAttribute('data-tutorial-active');
    });

    // Add highlight to current target
    target.setAttribute('data-tutorial-active', '');

    // Update tooltip content
    tooltip.querySelector('.tutorial-content').textContent = step.text;
    tooltip.querySelector('.tutorial-step').textContent = `${currentStep + 1} / ${STEPS.length}`;
    tooltip.querySelector('.tutorial-next').textContent =
      currentStep === STEPS.length - 1 ? 'Done' : 'Next';

    // Position and show tooltip
    tooltip.classList.remove('active');

    // Wait for layout then position
    requestAnimationFrame(() => {
      positionTooltip(target, step.pos);
      tooltip.classList.add('active');

      // Scroll target into view if needed
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Go to next step
  function nextStep() {
    currentStep++;
    if (currentStep >= STEPS.length) {
      endTutorial();
    } else {
      showStep();
    }
  }

  // End tutorial
  function endTutorial() {
    isActive = false;

    // Remove highlight
    document.querySelectorAll('[data-tutorial-active]').forEach(el => {
      el.removeAttribute('data-tutorial-active');
    });

    // Hide overlay and tooltip
    overlay.classList.remove('active');
    tooltip.classList.remove('active');

    // Mark as done
    localStorage.setItem(STORAGE_KEY, 'true');

    // Remove keyboard listener
    document.removeEventListener('keydown', handleKeydown);
  }

  // Handle keyboard navigation
  function handleKeydown(e) {
    if (!isActive) return;

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextStep();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      endTutorial();
    } else if (e.key === 'ArrowLeft' && currentStep > 0) {
      e.preventDefault();
      currentStep--;
      showStep();
    }
  }

  // Start tutorial
  function startTutorial() {
    if (!shouldRunTutorial()) return;

    isActive = true;
    currentStep = 0;

    createOverlay();
    createTooltip();

    // Activate overlay
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      showStep();
    });

    // Add keyboard navigation
    document.addEventListener('keydown', handleKeydown);
  }

  // Initialize on page load
  function init() {
    // Wait for DOM and initial render
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(startTutorial, 500);
      });
    } else {
      setTimeout(startTutorial, 500);
    }
  }

  // Export for manual control
  window.AUDTutorial = {
    start: startTutorial,
    end: endTutorial,
    reset: () => {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  };

  init();
})();
