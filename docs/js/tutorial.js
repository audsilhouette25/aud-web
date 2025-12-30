/**
 * Tutorial System for AUD
 * Step-based onboarding for new users
 * Usage: window.AUDTutorial.start(steps, storageKey)
 */

(function() {
  'use strict';

  const TOOLTIP_GAP = 12;

  let steps = [];
  let storageKey = '';
  let currentStep = 0;
  let overlay = null;
  let highlight = null;
  let tooltip = null;
  let isActive = false;
  let currentTarget = null;

  // Update highlight/tooltip position on scroll/resize
  function updatePosition() {
    if (!isActive || !currentTarget || !highlight || !tooltip) return;
    const rect = currentTarget.getBoundingClientRect();
    const pad = 4;
    highlight.style.top = `${rect.top - pad}px`;
    highlight.style.left = `${rect.left - pad}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;
    positionTooltip(rect, steps[currentStep]);
  }

  function handleScroll() {
    if (!isActive) return;
    requestAnimationFrame(updatePosition);
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    document.body.appendChild(overlay);
  }

  function createHighlight() {
    highlight = document.createElement('div');
    highlight.className = 'tutorial-highlight';
    document.body.appendChild(highlight);
  }

  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'tutorial-tooltip';

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

    tooltip.querySelectorAll('.tutorial-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        goToStep(parseInt(dot.dataset.step, 10));
      });
    });

    document.body.appendChild(tooltip);
  }

  function goToStep(stepNum) {
    if (stepNum >= 0 && stepNum < steps.length) {
      currentStep = stepNum;
      showStep();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      showStep();
    }
  }

  function positionTooltip(rect, step) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;
    const pos = step.position || 'bottom';

    let top, left;

    if (pos === 'right') {
      // Position to the right of the target
      left = rect.right + TOOLTIP_GAP;
      top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);

      // Clamp to viewport
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));

      // If no room on right, fall back to bottom
      if (left + tooltipRect.width > window.innerWidth - padding) {
        return positionTooltip(rect, { ...step, position: 'bottom' });
      }

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.setAttribute('data-pos', 'right');
    } else {
      // Default: bottom position
      top = rect.bottom + TOOLTIP_GAP;
      left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

      const offsetX = step.offsetX || 0;
      left += offsetX;

      const clampedLeft = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));

      const targetCenterX = rect.left + rect.width / 2;
      const arrowLeft = targetCenterX - clampedLeft;
      const clampedArrowLeft = Math.max(20, Math.min(arrowLeft, tooltipRect.width - 20));

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${clampedLeft}px`;
      tooltip.style.setProperty('--arrow-left', `${clampedArrowLeft}px`);
      tooltip.setAttribute('data-pos', 'bottom');
    }
  }

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

    currentTarget = target;
    const rect = target.getBoundingClientRect();
    const pad = 4;
    highlight.style.top = `${rect.top - pad}px`;
    highlight.style.left = `${rect.left - pad}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;

    tooltip.querySelector('.tutorial-content').textContent = step.text;

    tooltip.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentStep);
    });

    const backBtn = tooltip.querySelector('.tutorial-back');
    const nextBtn = tooltip.querySelector('.tutorial-next');
    backBtn.disabled = currentStep === 0;
    nextBtn.textContent = currentStep === steps.length - 1 ? 'Done' : 'Next';

    tooltip.classList.remove('active');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      requestAnimationFrame(() => {
        const newRect = target.getBoundingClientRect();
        highlight.style.top = `${newRect.top - pad}px`;
        highlight.style.left = `${newRect.left - pad}px`;
        highlight.style.width = `${newRect.width + pad * 2}px`;
        highlight.style.height = `${newRect.height + pad * 2}px`;
        positionTooltip(newRect, step);
        tooltip.classList.add('active');
      });
    }, 300);
  }

  function nextStep() {
    currentStep++;
    if (currentStep >= steps.length) {
      endTutorial();
    } else {
      showStep();
    }
  }

  function endTutorial() {
    isActive = false;
    currentTarget = null;
    if (overlay) overlay.remove();
    if (highlight) highlight.remove();
    if (tooltip) tooltip.classList.remove('active');
    if (storageKey) localStorage.setItem(storageKey, 'true');
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('resize', handleScroll);
  }

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

  /**
   * Start tutorial with given steps
   * @param {Array} stepConfig - Array of {selector, text, offsetX?}
   * @param {string} key - localStorage key for completion tracking
   */
  function startTutorial(stepConfig, key) {
    if (!stepConfig || stepConfig.length === 0) return;

    steps = stepConfig;
    storageKey = key || '';

    // For development: always run
    // For production: check localStorage
    // if (storageKey && localStorage.getItem(storageKey)) return;

    isActive = true;
    currentStep = 0;

    createOverlay();
    createHighlight();
    createTooltip();

    requestAnimationFrame(() => {
      showStep();
    });

    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
  }

  window.AUDTutorial = {
    start: startTutorial,
    end: endTutorial,
    reset: (key) => {
      if (key) localStorage.removeItem(key);
      location.reload();
    }
  };
})();
