export const dropFeedStyles = `
        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes signalTape {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        .signal-ticker {
          position: relative;
          width: 100%;
          margin: 12px 0 0;
          overflow: hidden;
          background: linear-gradient(90deg, transparent, rgba(27,18,12,0.72) 48%, transparent);
        }
        .dropfeed-signal-card { border: 0; }
        .signal-ticker::before,
        .signal-ticker::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          z-index: 2;
          width: 42px;
          pointer-events: none;
        }
        .signal-ticker::before {
          left: 0;
          background: linear-gradient(90deg, rgba(10,7,5,1), transparent);
        }
        .signal-ticker::after {
          right: 0;
          background: linear-gradient(270deg, rgba(10,7,5,1), transparent);
        }
        .signal-ticker-track {
          display: inline-flex;
          width: max-content;
          align-items: center;
          gap: 0;
          padding: 8px 0;
          animation: signalTape 28s linear infinite;
          will-change: transform;
        }
        .signal-ticker:hover .signal-ticker-track { animation-play-state: paused; }
        .signal-ticker:focus .signal-ticker-track { animation-play-state: paused; }

        .signal-ticker-track.reduced {
          display: flex;
          width: 100%;
          flex-wrap: wrap;
          justify-content: center;
          animation: none;
          transform: none;
        }
        .signal-ticker-track.reduced .signal-ticker-item { flex: 1 1 180px; justify-content: center; }
        .signal-ticker-item {
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
          padding: 0 18px;
          white-space: nowrap;
          border-right: 1px solid rgba(196,148,58,0.2);
        }
        .signal-ticker-label {
          font-family: var(--font-jetbrains);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: rgba(245,237,214,0.46);
        }
        .signal-ticker-value {
          font-family: var(--font-jetbrains);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.03em;
          color: rgba(232,201,122,0.98);
          text-shadow: 0 0 18px rgba(196,148,58,0.2);
        }
        @media (prefers-reduced-motion: reduce) {
          .signal-ticker-track { animation: none; transform: none; }
        }
        .dropfeed-card-stack {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
        }
        .dropfeed-details-control {
          transition: color 160ms ease;
        }
        .dropfeed-signal-card:hover .dropfeed-details-control {
          color: rgba(245,237,214,0.88) !important;
        }
        @media (max-width: 767px) {
          #drops { padding-top: 32px !important; }
          .dropfeed-shell { padding-left: 18px !important; padding-right: 18px !important; }
          .dropfeed-title { font-size: 34px !important; letter-spacing: -0.03em !important; }
          .dropfeed-subcopy { font-size: 14px !important; line-height: 1.45 !important; max-width: 42ch; }
          .signal-ticker { margin-top: 18px; margin-bottom: 18px; }
          .dropfeed-nudge { display:none; }
          .dropfeed-filter-row {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px !important;
            overflow: visible !important;
            padding-bottom: 12px !important;
            margin-left: 0 !important;
            width: 100%;
            scrollbar-width: none;
          }
          .dropfeed-filter-row::-webkit-scrollbar { display:none; }
          .dropfeed-filter-row button {
            width: 100% !important;
            min-width: 0 !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            text-align: center;
          }
          .dropfeed-card-meta {
            gap: 6px !important;
          }
          .dropfeed-card-meta span {
            font-size: 9px !important;
          }
          .dropfeed-detail-panel { padding: 16px 18px 18px !important; }
        }
        .sighting-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          background: rgba(245,237,214,0.055);
          color: rgba(245,237,214,0.62);
          border-radius: 999px;
          padding: 5px 9px;
          font-family: var(--font-dm-sans);
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          text-decoration: none;
          cursor: pointer;
          transition: background 150ms, color 150ms, border-color 150ms;
        }
        .sighting-chip:hover,
        .sighting-chip.active {
          border-color: rgba(196,148,58,0.42);
          background: rgba(196,148,58,0.12);
          color: rgba(232,201,122,0.98);
        }
        .sighting-chip.caution,
        .sighting-chip.active.caution {
          border-color: rgba(255,180,120,0.32);
          background: rgba(255,120,80,0.1);
          color: rgba(255,206,184,0.96);
        }
        .drop-tier-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid currentColor;
          border-radius: 999px;
          padding: 4px 8px 3px;
          font-family: var(--font-jetbrains);
          font-size: 9px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .drop-tier-badge.tier-unicorn {
          color: #120d08;
          background: linear-gradient(135deg, #C4943A 0%, #E8C97A 52%, #C4943A 100%);
          border-color: rgba(232,201,122,0.8) !important;
        }
        .drop-tier-badge.tier-highly_allocated {
          color: #F0BD69;
          background: linear-gradient(135deg, rgba(216,154,56,0.24), rgba(239,184,92,0.14));
          border-color: rgba(232,166,64,0.48) !important;
        }
        .drop-tier-badge.tier-allocated {
          color: #FFD5A0;
          background: rgba(184,115,51,0.22);
          border-color: rgba(184,115,51,0.48) !important;
        }
        .drop-tier-badge.tier-limited {
          color: rgba(245,237,214,0.72);
          background: rgba(138,138,138,0.16);
          border-color: rgba(138,138,138,0.35) !important;
        }
        .drop-tier-badge.tier-standard,
        .drop-tier-badge.tier-core,
        .drop-tier-badge.tier-unknown {
          color: rgba(245,237,214,0.58);
          background: rgba(166,157,132,0.10);
          border-color: rgba(166,157,132,0.26) !important;
        }
        .drop-tier-badge.tier-core,
        .drop-tier-badge.tier-unknown {
          color: rgba(245,237,214,0.48);
          background: rgba(166,157,132,0.07);
          border-color: rgba(166,157,132,0.18) !important;
        }
        .dropfeed-refine-grid {
          display: grid;
          grid-template-columns: minmax(112px, 0.95fr) minmax(150px, 1.2fr) minmax(96px, 0.75fr) minmax(126px, 0.9fr);
          gap: 8px;
          align-items: end;
          padding-bottom: 8px;
        }
        .dropfeed-refine-search { grid-column: 1 / -1; }
        .dropfeed-refine-field span {
          display: block;
          margin-bottom: 6px;
          font-family: var(--font-jetbrains);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(245,237,214,0.42);
        }
        .dropfeed-refine-field input,
        .bourbon-menu-trigger {
          width: 100%;
          min-width: 0;
          height: 39px;
          border-radius: 11px;
          border: 1px solid rgba(212,146,11,0.12);
          background: rgba(20,16,12,0.64);
          color: var(--color-cream);
          font-family: var(--font-dm-sans);
          font-size: 13px;
          font-weight: 600;
          padding: 9px 10px;
          outline: none;
        }
        .bourbon-menu { position: relative; min-width: 0; }
        .bourbon-menu-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          text-align: left;
          cursor: pointer;
        }
        .bourbon-menu-trigger span:first-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bourbon-menu-panel {
          position: absolute;
          z-index: 40;
          top: calc(100% + 7px);
          left: 0;
          right: 0;
          max-height: 286px;
          overflow-y: auto;
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
          padding: 8px;
          border-radius: 16px;
          border: 1px solid rgba(196,148,58,0.2);
          background: rgba(17,13,10,0.98);
          box-shadow: 0 18px 40px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04);
          scrollbar-color: rgba(245,237,214,0.48) rgba(245,237,214,0.08);
          scrollbar-width: thin;
        }
        .bourbon-menu.dropfeed-area-menu .bourbon-menu-panel { min-width: min(660px, calc(100vw - 32px)); grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .bourbon-menu-option {
          min-height: 44px;
          border-radius: 12px;
          border: 0;
          background: transparent;
          color: rgba(245,237,214,0.72);
          font-family: var(--font-dm-sans);
          font-size: 13px;
          font-weight: 650;
          text-align: left;
          padding: 10px 12px;
          cursor: pointer;
        }
        .bourbon-menu-option:hover,
        .bourbon-menu-option.active {
          border-color: rgba(196,148,58,0.34);
          background: rgba(196,148,58,0.12);
          color: var(--color-cream);
        }

        .dropfeed-result-line {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px 12px;
          margin: -2px 0 12px;
          color: rgba(245,237,214,0.42);
          font-family: var(--font-dm-sans);
          font-size: 12px;
          line-height: 1.4;
        }
        .dropfeed-clear-filters {
          border: 0;
          background: transparent;
          color: rgba(232,201,122,0.72);
          font-family: var(--font-dm-sans);
          font-size: 12px;
          font-weight: 700;
          padding: 0;
          cursor: pointer;
          white-space: nowrap;
        }
        @media (max-width: 767px) {
          .dropfeed-refine-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
          .dropfeed-refine-search { grid-column: 1 / -1; }
          .dropfeed-refine-field span { font-size: 8px; margin-bottom: 5px; }
          .dropfeed-refine-field input,
          .bourbon-menu-trigger { padding: 9px 8px; height: 40px; }
          .dropfeed-refine-field input { font-size: 16px; }
          .bourbon-menu-trigger { font-size: 13px; }
          .bourbon-menu.dropfeed-area-menu .bourbon-menu-panel {
            left: 0;
            right: 0;
            transform: none;
            width: 100%;
            min-width: 0;
            grid-template-columns: 1fr;
            max-height: 318px;
          }
          .bourbon-menu-option { min-height: 42px; font-size: 12px; padding: 9px 10px; }
          .dropfeed-filter-row {
            display: flex !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            gap: 8px !important;
            padding-bottom: 12px !important;
            margin: 0 -18px 0 0 !important;
            scrollbar-width: none;
          }
          .dropfeed-filter-row button {
            width: auto !important;
            min-width: max-content !important;
            padding: 8px 14px !important;
            border-radius: 999px !important;
          }
        }
      `;
