/**
 * Tutorial System for AUD
 * Step-based onboarding for new users
 * Supports multiple pages with different tutorial steps
 */

(function() {
  'use strict';

  // Tutorial steps configuration per page
  const PAGE_STEPS = {
    'me.html': [
      {
        selector: '.menu a[href="./collect.html"]',
        text: 'Register new aud:',
        offsetX: 60
      },
      {
        selector: '.menu a[href="./gallery.html"]',
        text: 'Overview of all aud:. If you\'ve collected one, you\'ll see its full appearance here!'
      },
      {
        selector: '.menu a[href="./custom.html"]',
        text: 'Customize your aud: container. If you\'ve collected Jibbitz, press Collect to add them to your collection!'
      },
      {
        selector: '.menu a[href="./game.html"]',
        text: 'Play sound-related games with aud:'
      },
      {
        selector: '.panel.kpi-box:nth-child(1)',
        text: 'Number of posts you\'ve created'
      },
      {
        selector: '.panel.kpi-box:nth-child(2)',
        text: 'Number of votes on your feed posts'
      },
      {
        selector: '.panel.rate-box',
        text: 'Match rate between votes received and your actual label'
      },
      {
        selector: '.quick .panel:first-child',
        text: 'Your collection summary: aud:, Jibbitz, and posts'
      },
      {
        selector: '.panel.lab',
        text: 'Draw sounds! Your artwork can become a new aud:'
      }
    ],
    'game1.html': [
      {
        selector: '#feed-root',
        text: 'Vote and like posts from other users. Help identify which sound each drawing represents!'
      },
      {
        selector: '#grid-labels .card:first-child, #grid-labels > *:first-child',
        text: 'Create posts with your collected aud:. Draw your interpretation and let others vote on it!'
      }
    ]
  };

  // Get current page name
  function getPageName() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    return page;
  }

  // Get steps for current page
  function getSteps() {
    const page = getPageName();
    return PAGE_STEPS[page] || [];
  }

  // Get storage key for current page
  function getStorageKey() {
    const page = getPageName();
    return `aud:tutorial-done:${page}`;
  }

  const TOOLTIP_GAP = 12; // Fixed gap between element and tooltip

  let steps = [];
  let storageKey = '';
  let currentStep = 0;
  let overlay = null;
  let highlight = null;
  let tooltip = null;
  let isActive = false;

  // Check if tutorial should run
  function shouldRunTutorial() {
    // For development: always run (comment out for production)
    return true;

    // For production: only run for first-time users
    // return !localStorage.getItem(storageKey);
  }

  // Create overlay to block all page interactions
  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    document.body.appendChild(overlay);
  }

  // Create highlight box element
  function createHighlight() {
    highlight = document.createElement('div');
    highlight.className = 'tutorial-highlight';
    document.body.appendChild(highlight);
  }

  // Create tooltip element
  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'tutorial-tooltip';

    // Build progress dots
    let dotsHTML = '';
    for (let i = 0; i < steps.length; i++) {
      dotsHTML += `<button class="tutorial-dot" data-step="${i}" aria-label="Step ${i + 1}"></button>`;
    }

    tooltip.innerHTML = `
      <button class="tutorial-close" aria-label="Skip tutorial">Skip</button>
      <div class="tutorial-content"></div>
      <div class="tutorial-footer">
        <button class="tutorial-back">Back</button>
        <div class="tutorial-dots">${dotsHTML}</div>
        <button class="tutorial-next">Next</button>
      </div>
    `;

    tooltip.querySelector('.tutorial-next').addEventListener('click', (e) => {
      e.stopPropagation();
      nextStep();
    });

    tooltip.querySelector('.tutorial-back').addEventListener('click', (e) => {
      e.stopPropagation();
      prevStep();
    });

    tooltip.querySelector('.tutorial-close').addEventListener('click', (e) => {
      e.stopPropagation();
      endTutorial();
    });

    // Dot click handlers
    tooltip.querySelectorAll('.tutorial-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = parseInt(dot.dataset.step, 10);
        goToStep(step);
      });
    });

    document.body.appendChild(tooltip);
  }

  // Go to specific step
  function goToStep(stepNum) {
    if (stepNum >= 0 && stepNum < steps.length) {
      currentStep = stepNum;
      showStep();
    }
  }

  // Go to previous step
  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      showStep();
    }
  }

  // Position tooltip below target element with fixed gap
  function positionTooltip(rect, step) {
    const tooltipRect = tooltip.getBoundingClientRect();

    // Always position below the element
    let top = rect.bottom + TOOLTIP_GAP;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

    // Apply horizontal offset if specified
    const offsetX = step.offsetX || 0;
    left += offsetX;

    // Keep tooltip within viewport horizontally
    const padding = 16;
    const clampedLeft = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

    // Keep tooltip within viewport vertically
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));

    // Calculate arrow position: target center relative to tooltip left
    const targetCenterX = rect.left + rect.width / 2;
    const arrowLeft = targetCenterX - clampedLeft;
    // Clamp arrow within tooltip bounds (with padding)
    const arrowMin = 20;
    const arrowMax = tooltipRect.width - 20;
    const clampedArrowLeft = Math.max(arrowMin, Math.min(arrowLeft, arrowMax));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${clampedLeft}px`;
    tooltip.style.setProperty('--arrow-left', `${clampedArrowLeft}px`);
    tooltip.setAttribute('data-pos', 'bottom');
  }

  // Show current step
  function showStep() {
    if (currentStep >= steps.length) {
      endTutorial();
      return;
    }

    const step = steps[currentStep];
    const target = document.querySelector(step.selector);

    if (!target) {
      currentStep++;
      showStep();
      return;
    }

    // Position highlight box over target (with 4px padding)
    const rect = target.getBoundingClientRect();
    const pad = 4;
    highlight.style.top = `${rect.top - pad}px`;
    highlight.style.left = `${rect.left - pad}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;

    // Update tooltip content
    tooltip.querySelector('.tutorial-content').textContent = step.text;

    // Update progress dots
    tooltip.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentStep);
    });

    // Update button states
    const backBtn = tooltip.querySelector('.tutorial-back');
    const nextBtn = tooltip.querySelector('.tutorial-next');

    backBtn.disabled = currentStep === 0;
    nextBtn.textContent = currentStep === steps.length - 1 ? 'Done' : 'Next';

    // Position and show tooltip
    tooltip.classList.remove('active');

    // Scroll target into view first, then position tooltip
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll and layout then position
    setTimeout(() => {
      requestAnimationFrame(() => {
        // Update highlight position after scroll (with 4px padding)
        const newRect = target.getBoundingClientRect();
        const pad = 4;
        highlight.style.top = `${newRect.top - pad}px`;
        highlight.style.left = `${newRect.left - pad}px`;
        highlight.style.width = `${newRect.width + pad * 2}px`;
        highlight.style.height = `${newRect.height + pad * 2}px`;

        positionTooltip(newRect, step);
        tooltip.classList.add('active');
      });
    }, 300);
  }

  // Go to next step
  function nextStep() {
    currentStep++;
    if (currentStep >= steps.length) {
      endTutorial();
    } else {
      showStep();
    }
  }

  // End tutorial
  function endTutorial() {
    isActive = false;

    // Remove overlay, highlight and tooltip
    if (overlay) overlay.remove();
    if (highlight) highlight.remove();
    tooltip.classList.remove('active');

    // Mark as done
    localStorage.setItem(storageKey, 'true');

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
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevStep();
    }
  }

  // Start tutorial
  function startTutorial() {
    // Initialize steps and storage key for current page
    steps = getSteps();
    storageKey = getStorageKey();

    // Don't run if no steps for this page
    if (steps.length === 0) return;

    if (!shouldRunTutorial()) return;

    isActive = true;
    currentStep = 0;

    createOverlay();
    createHighlight();
    createTooltip();

    // Start tutorial
    requestAnimationFrame(() => {
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
      const key = getStorageKey();
      localStorage.removeItem(key);
      location.reload();
    }
  };

  init();
})();
