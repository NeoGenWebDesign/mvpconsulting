(async function() {
    try {
      const res = await fetch('/api/announcements?active=true');
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;
  
      // Join announcements with a separator
      const text = data.map(d => d.content).join('   +++   ');
  
      // Create Styles
      const style = document.createElement('style');
      style.textContent = `
        .announcement-bar {
          width: 100%;
          background: #000;
          color: #fff;
          overflow: hidden;
          padding: 12px 0;
          /* Positioning to attach to bottom of nav */
          position: absolute; 
          top: 100%;
          left: 0;
          z-index: 40;
          font-family: system-ui, -apple-system, sans-serif;
          font-weight: 500;
          display: flex;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .ticker-wrapper {
          width: 100%;
          overflow: hidden;
          white-space: nowrap;
        }
        .ticker-content {
          display: inline-block;
          white-space: nowrap;
          animation: ticker-scroll 30s linear infinite;
        }
        .ticker-content span {
          display: inline-block;
          padding-right: 50px;
        }
        @keyframes ticker-scroll {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        .announcement-bar:hover .ticker-content {
          animation-play-state: paused;
        }
      `;
      document.head.appendChild(style);
  
      // Create Elements
      const bar = document.createElement('div');
      bar.className = 'announcement-bar';
      
      const wrapper = document.createElement('div');
      wrapper.className = 'ticker-wrapper';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'ticker-content';
      
      // Duplicate text to ensure loop
      const spans = `<span>${text}</span><span>${text}</span>`; 
      contentDiv.innerHTML = spans;
  
      wrapper.appendChild(contentDiv);
      bar.appendChild(wrapper);
  
      // Insert into DOM Logic
      const insertTicker = () => {
          if (document.querySelector('.announcement-bar')) return;

          // Find Navigation Bar
          // We prefer <nav> or <header>
          const nav = document.querySelector('nav') || document.querySelector('header');

          if (nav) {
              console.log('Injecting announcement bar into nav:', nav);
              
              // Ensure the nav acts as a positioning context
              const computed = window.getComputedStyle(nav);
              if (computed.position === 'static') {
                  nav.style.position = 'relative';
              }
              
              nav.appendChild(bar);
          } else {
              // Fallback: Top of body/root if no nav found
              const root = document.getElementById('root') || document.getElementById('app') || document.body;
              
              if (root.firstChild) {
                  root.insertBefore(bar, root.firstChild);
              } else {
                  root.appendChild(bar);
              }
              
              // Reset positioning for fallback (relative flow)
              bar.style.position = 'relative';
              bar.style.top = 'auto';
          }
      };

      // SPA handling
      const observer = new MutationObserver((mutations) => {
          if (!document.querySelector('.announcement-bar')) {
              insertTicker();
          }
      });

      const rootEl = document.getElementById('root') || document.getElementById('app') || document.body;
      
      if (rootEl) {
          observer.observe(rootEl, { childList: true, subtree: true });
          insertTicker();
      } else {
          document.addEventListener('DOMContentLoaded', () => {
             insertTicker();
             const newRoot = document.getElementById('root') || document.getElementById('app') || document.body;
             if (newRoot) observer.observe(newRoot, { childList: true, subtree: true });
          });
      }
  
    } catch (e) {
      console.error('Announcements error:', e);
    }
  })();