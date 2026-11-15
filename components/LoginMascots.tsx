// @ts-nocheck -- mesin animasi di bawah adalah port verbatim JavaScript vanilla
// dari repo user (login-mascots.js); pemeriksaan tipe dilonggarkan khusus file
// ini agar port tetap setia 1:1. Logika & perilaku teruji dari sumbernya.
"use client";

import { useEffect, useRef } from "react";

/**
 * Maskot login animasi — port setia dari dashboard-branding-legacy
 * (public/login.html + public/login-mascots.js, repo user): pupil mengikuti
 * pointer & karet username, memalingkan muka + bersiul saat password diketik,
 * sebagian menutup mata, terkejut + mengintip saat password ditampilkan,
 * berkedip acak, dan bereaksi pada status login (waiting/failure).
 * Adaptasi OMS: #email -> #username; submit form menyalakan status waiting
 * + flag splash pasca-login.
 */
export default function LoginMascots({ initialState }: { initialState?: "failure" }) {
  const stageRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const emailInput = document.getElementById("username") as HTMLInputElement | null;
    const passwordInput = document.getElementById("password") as HTMLInputElement | null;
    const toggleButton = document.getElementById("togglePassword") as HTMLButtonElement | null;
    if (!stage || !emailInput || !passwordInput || !toggleButton) return;

  const abort = new AbortController();
  const { signal } = abort;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mascots = Array.from(stage.querySelectorAll('[data-mascot]'), (element, index) => {
    const mascot = {
      element,
      attentive: element.hasAttribute('data-attentive'),
      mouth: element.querySelector('.mascot__mouth'),
      eyes: [],
    };
    mascot.eyes = Array.from(element.querySelectorAll('.eye'), (node) => {
      const sclera = node.querySelector('.eye__sclera');
      const pupil = node.querySelector('.eye__pupil');
      const scleraRadius = Number.parseFloat(sclera.getAttribute('r'));
      const pupilRadius = Number.parseFloat(pupil.firstElementChild.getAttribute('r'));
      return {
        mascot,
        node,
        sclera,
        pupil,
        maxOffset: scleraRadius - pupilRadius - 0.9,
        smoothing: 70 + index * 14,
        centerX: 0,
        centerY: 0,
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
      };
    });
    return mascot;
  });
  const eyes = mascots.flatMap((mascot) => mascot.eyes);
  const pointer = { x: 0, y: 0, active: false };
  const state = {
    focus: null,
    glancing: false,
    passwordTyping: passwordInput.value.length > 0,
    passwordVisible: passwordInput.type === 'text',
    authState: null,
    centersStale: true,
    targetsStale: true,
    lastFrameTime: 0,
    frameId: 0,
    blinkTimer: 0,
    blinkEndTimer: 0,
    glanceTimer: 0,
    startleTimer: 0,
  };

  function measureEyeCenters() {
    if (!state.centersStale) return;
    for (const eye of eyes) {
      const rect = eye.sclera.getBoundingClientRect();
      eye.centerX = rect.left + rect.width / 2;
      eye.centerY = rect.top + rect.height / 2;
    }
    state.centersStale = false;
  }

  function setTarget(eye, x, y) {
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    eye.targetX = x * scale * eye.maxOffset;
    eye.targetY = y * scale * eye.maxOffset;
  }

  function aimAt(eye, point) {
    const dx = point.x - eye.centerX;
    const dy = point.y - eye.centerY;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) {
      setTarget(eye, 0, 0);
      return;
    }
    const reach = Math.min(1, distance / 140);
    setTarget(eye, (dx / distance) * reach, (dy / distance) * reach);
  }

  function gazeMode() {
    if (state.authState) return state.authState;
    if (state.glancing || state.passwordTyping) return 'away';
    if (state.focus === 'email') return 'email';
    return pointer.active ? 'pointer' : 'idle';
  }

  function computeTargets() {
    measureEyeCenters();
    switch (gazeMode()) {
      case 'away':
        for (const eye of eyes) {
          if (state.passwordTyping && eye.mascot.element.hasAttribute('data-password-lookaway')) {
            const direction = eye.mascot.element.classList.contains('mascot--tall') ? -0.78 : 0.78;
            setTarget(eye, direction, -0.62);
          } else {
            setTarget(eye, -0.85, 0.4);
          }
        }
        break;
      case 'email': {
        const rect = emailInput.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const fieldCenter = { x: rect.left + rect.width / 2, y: centerY };
        const caret = {
          x: Math.min(rect.right - 20, rect.left + 18 + emailInput.value.length * 7),
          y: centerY,
        };
        for (const eye of eyes) aimAt(eye, eye.mascot.attentive ? caret : fieldCenter);
        break;
      }
      case 'waiting':
        for (const eye of eyes) setTarget(eye, 0, 0);
        break;
      case 'success':
        for (const eye of eyes) setTarget(eye, 0, -0.2);
        break;
      case 'failure':
        for (const eye of eyes) setTarget(eye, -0.2, 0);
        break;
      case 'pointer':
        for (const eye of eyes) aimAt(eye, pointer);
        break;
      default:
        for (const eye of eyes) setTarget(eye, 0.4, 0.1);
    }
  }

  function tick(time) {
    state.frameId = 0;
    if (state.targetsStale) {
      computeTargets();
      state.targetsStale = false;
    }
    const dt = state.lastFrameTime ? Math.min(time - state.lastFrameTime, 64) : 16;
    state.lastFrameTime = time;
    const instant = reduceMotion.matches;
    let moving = false;
    for (const eye of eyes) {
      const factor = instant ? 1 : 1 - Math.exp(-dt / eye.smoothing);
      eye.x += (eye.targetX - eye.x) * factor;
      eye.y += (eye.targetY - eye.y) * factor;
      if (Math.abs(eye.targetX - eye.x) > 0.01 || Math.abs(eye.targetY - eye.y) > 0.01) {
        moving = true;
      } else {
        eye.x = eye.targetX;
        eye.y = eye.targetY;
      }
      eye.pupil.setAttribute('transform', `translate(${eye.x.toFixed(2)} ${eye.y.toFixed(2)})`);
    }
    if (moving) {
      state.frameId = requestAnimationFrame(tick);
    } else {
      state.lastFrameTime = 0;
    }
  }

  function requestFrame() {
    if (!state.frameId && !document.hidden) state.frameId = requestAnimationFrame(tick);
  }

  function invalidateTargets() {
    state.targetsStale = true;
    requestFrame();
  }

  function invalidateLayout() {
    state.centersStale = true;
    invalidateTargets();
  }

  function setExpression(name) {
    stage.dataset.expression = name;
    for (const mascot of mascots) {
      const mouthPath = name === 'password-typing' && mascot.element.hasAttribute('data-password-lookaway')
        ? mascot.mouth.dataset.whistle
        : mascot.mouth.dataset[name] || mascot.mouth.dataset.neutral;
      mascot.mouth.setAttribute('d', mouthPath);
    }
  }

  function updatePasswordExpression() {
    if (state.glancing) setExpression('shy');
    else setExpression(state.passwordTyping ? 'password-typing' : 'neutral');
  }

  function startle() {
    if (reduceMotion.matches) return;
    window.clearTimeout(state.startleTimer);
    stage.classList.remove('is-startled');
    void stage.getBoundingClientRect();
    stage.classList.add('is-startled');
    state.startleTimer = window.setTimeout(() => stage.classList.remove('is-startled'), 900);
  }

  function clearBlinkClasses() {
    for (const eye of eyes) eye.node.classList.remove('is-blinking');
  }

  function blink() {
    const group = Math.random() < 0.25
      ? mascots
      : [mascots[Math.floor(Math.random() * mascots.length)]];
    for (const mascot of group) {
      for (const eye of mascot.eyes) eye.node.classList.add('is-blinking');
    }
    window.clearTimeout(state.blinkEndTimer);
    state.blinkEndTimer = window.setTimeout(() => {
      for (const mascot of group) {
        for (const eye of mascot.eyes) eye.node.classList.remove('is-blinking');
      }
    }, 130);
  }

  function scheduleBlink() {
    window.clearTimeout(state.blinkTimer);
    if (reduceMotion.matches || document.hidden) return;
    state.blinkTimer = window.setTimeout(() => {
      blink();
      scheduleBlink();
    }, 2400 + Math.random() * 4200);
  }

  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
    invalidateTargets();
  }, { passive: true, signal });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.active = false;
    invalidateTargets();
  }, { signal });
  window.addEventListener('resize', invalidateLayout, { passive: true, signal });
  window.addEventListener('scroll', invalidateLayout, { passive: true, signal });

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(invalidateLayout) : null;
  if (resizeObserver) resizeObserver.observe(stage);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      window.clearTimeout(state.blinkTimer);
      clearBlinkClasses();
    } else {
      scheduleBlink();
      invalidateLayout();
    }
  }, { signal });

  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      window.clearTimeout(state.blinkTimer);
      clearBlinkClasses();
    } else {
      scheduleBlink();
    }
    invalidateTargets();
  }, { signal });

  emailInput.addEventListener('focus', () => {
    state.focus = 'email';
    invalidateTargets();
  }, { signal });
  emailInput.addEventListener('blur', () => {
    state.focus = null;
    invalidateTargets();
  }, { signal });
  emailInput.addEventListener('input', invalidateTargets, { signal });
  passwordInput.addEventListener('focus', () => {
    state.passwordTyping = passwordInput.value.length > 0;
    updatePasswordExpression();
    invalidateTargets();
  }, { signal });
  passwordInput.addEventListener('input', () => {
    state.passwordTyping = passwordInput.value.length > 0;
    updatePasswordExpression();
    invalidateTargets();
  }, { signal });
  passwordInput.addEventListener('blur', () => {
    state.passwordTyping = false;
    updatePasswordExpression();
    invalidateTargets();
  }, { signal });

  toggleButton.addEventListener('click', () => {
    state.passwordVisible = passwordInput.type === 'password';
    passwordInput.type = state.passwordVisible ? 'text' : 'password';
    toggleButton.setAttribute('aria-pressed', String(state.passwordVisible));
    toggleButton.setAttribute(
      'aria-label',
      state.passwordVisible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi',
    );
    window.clearTimeout(state.glanceTimer);
    state.glancing = state.passwordVisible;
    updatePasswordExpression();
    if (state.passwordVisible) {
      startle();
      state.glanceTimer = window.setTimeout(() => {
        state.glancing = false;
        updatePasswordExpression();
        invalidateTargets();
      }, 1800);
    }
    invalidateTargets();
    passwordInput.focus();
  }, { signal });

  window.addEventListener('login-visual-state', (event) => {
    state.authState = ['waiting', 'success', 'failure'].includes(event.detail?.state)
      ? event.detail.state
      : null;
    invalidateTargets();
  }, { signal });
  // --- tambahan OMS: status waiting + flag splash saat form dikirim ---
  const form = passwordInput.closest("form");
  form?.addEventListener("submit", () => {
    state.authState = "waiting";
    try { sessionStorage.setItem("oms-splash", "1"); } catch { /* abaikan */ }
    invalidateTargets();
  }, { signal });
  if (initialState === "failure") {
    state.authState = "failure";
    invalidateTargets();
    window.setTimeout(() => { state.authState = null; invalidateTargets(); }, 1900);
  }

  setExpression('neutral');
  scheduleBlink();
  invalidateLayout();

  return () => {
    abort.abort();
    if (resizeObserver) resizeObserver.disconnect();
    cancelAnimationFrame(state.frameId);
    window.clearTimeout(state.blinkTimer);
    window.clearTimeout(state.blinkEndTimer);
    window.clearTimeout(state.glanceTimer);
    window.clearTimeout(state.startleTimer);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mascot-stage" aria-hidden="true">
      <svg ref={stageRef} className="mascots" data-mascot-stage data-expression="neutral" viewBox="0 0 440 250" xmlns="http://www.w3.org/2000/svg" focusable="false">
      <ellipse className="mascots__shadow" cx="220" cy="243" rx="208" ry="4"/>
      <g className="mascot mascot--tall" data-mascot data-attentive data-password-lookaway style={{ "--i": 0 } as React.CSSProperties}><g className="mascot__inner">
        <rect className="mascot__body" x="120" y="50" width="100" height="190" rx="14"/><g className="mascot__face">
          <g transform="translate(152 96)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <g transform="translate(188 96)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <ellipse className="mascot__blush" cx="142" cy="111" rx="5" ry="3"/><ellipse className="mascot__blush" cx="198" cy="111" rx="5" ry="3"/><path className="mascot__mouth" d="M164 120 Q170 125 176 120" data-neutral="M164 120 Q170 125 176 120" data-shy="M165 121 Q167.5 118.5 170 121 T175 121" data-whistle="M170 118.5 a2.8 2.8 0 1 0 0.1 0"/>
        </g></g></g>
      <g className="mascot mascot--slate" data-mascot data-password-lookaway style={{ "--i": 1 } as React.CSSProperties}><g className="mascot__inner">
        <rect className="mascot__body" x="205" y="108" width="86" height="132" rx="12"/><g className="mascot__face">
          <g transform="translate(232 148)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <g transform="translate(264 148)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <ellipse className="mascot__blush" cx="222" cy="163" rx="5" ry="3"/><ellipse className="mascot__blush" cx="274" cy="163" rx="5" ry="3"/><path className="mascot__mouth" d="M242 172 Q248 177 254 172" data-neutral="M242 172 Q248 177 254 172" data-shy="M243 173 Q245.5 170.5 248 173 T253 173" data-whistle="M248 170.5 a2.8 2.8 0 1 0 0.1 0"/>
        </g></g></g>
      <g className="mascot mascot--dome" data-mascot data-password-close style={{ "--i": 2 } as React.CSSProperties}><g className="mascot__inner">
        <path className="mascot__body" d="M8 240 A82 82 0 0 1 172 240 Z"/><g className="mascot__face">
          <g transform="translate(72 198)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <g transform="translate(108 198)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <ellipse className="mascot__blush" cx="61" cy="212" rx="5" ry="3"/><ellipse className="mascot__blush" cx="119" cy="212" rx="5" ry="3"/><path className="mascot__mouth" d="M84 219 Q90 224 96 219" data-neutral="M84 219 Q90 224 96 219" data-shy="M85 220 Q87.5 217.5 90 220 T95 220" data-whistle="M90 217.5 a2.8 2.8 0 1 0 0.1 0"/>
        </g></g></g>
      <g className="mascot mascot--capsule" data-mascot data-password-close style={{ "--i": 3 } as React.CSSProperties}><g className="mascot__inner">
        <rect className="mascot__body" x="282" y="118" width="84" height="122" rx="42"/><g className="mascot__face">
          <g transform="translate(306 164)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <g transform="translate(342 164)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <ellipse className="mascot__blush" cx="298" cy="179" rx="5" ry="3"/><ellipse className="mascot__blush" cx="350" cy="179" rx="5" ry="3"/><path className="mascot__mouth" d="M318 187 Q324 192 330 187" data-neutral="M318 187 Q324 192 330 187" data-shy="M319 188 Q321.5 185.5 324 188 T329 188" data-whistle="M324 185.5 a2.8 2.8 0 1 0 0.1 0"/>
        </g></g></g>
      <g className="mascot mascot--cube" data-mascot style={{ "--i": 4 } as React.CSSProperties}><g className="mascot__inner">
        <rect className="mascot__body" x="352" y="172" width="78" height="68" rx="20"/><g className="mascot__face">
          <g transform="translate(377 198)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <g transform="translate(405 198)"><g className="eye"><circle className="eye__sclera" r="9"/><g className="eye__pupil"><circle className="eye__pupil-fill" r="4.2"/><circle className="eye__glint" cx="1.4" cy="-1.5" r="1.1"/></g></g></g>
          <ellipse className="mascot__blush" cx="367" cy="212" rx="5" ry="3"/><ellipse className="mascot__blush" cx="415" cy="212" rx="5" ry="3"/><path className="mascot__mouth" d="M386 217 Q391 221 396 217" data-neutral="M386 217 Q391 221 396 217" data-shy="M387 218 Q389 216 391 218 T395 218" data-whistle="M391 215 a2.8 2.8 0 1 0 0.1 0"/>
        </g></g></g>
    </svg>
    </div>
  );
}
