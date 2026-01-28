(function() {
    const POLL_MAX_RETRIES = 20; // 10 seconds total wait
    const POLL_INTERVAL = 500;
    let retries = 0;

    async function init() {
        try {
            const response = await fetch('/api/announcements?status=approved');
            if (!response.ok) return;
            const announcements = await response.json();

            if (!announcements || announcements.length === 0) return;

            // Create container
            const bar = document.createElement('div');
            bar.id = 'announcement-bar';

            const track = document.createElement('div');
            track.className = 'announcement-track';

            announcements.forEach(a => {
                const item = document.createElement('span');
                item.className = 'announcement-item';
                item.textContent = a.content;
                track.appendChild(item);
            });

            bar.appendChild(track);

            // Calculate speed dynamically based on content length
            // Base 10s + 0.15s per character
            const totalChars = announcements.reduce((acc, curr) => acc + curr.content.length, 0);
            const duration = Math.max(10, 10 + (totalChars * 0.15));
            track.style.animationDuration = `${duration}s`;

            // Function to find insertion point
            const insert = () => {
                if (document.getElementById('announcement-bar')) return true; // Already inserted

                // Prioritize Navigation Bar / Header
                const navSelectors = [
                    'header', 
                    'nav', 
                    '.navbar', 
                    '.main-header', 
                    '.site-header',
                    '[role="banner"]',
                    '[role="navigation"]'
                ];
                
                let target = null;

                for (const sel of navSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        // Ensure we are getting the top-most container if nested
                        // But usually the first match for 'header' or 'nav' is the main one
                        target = el;
                        console.log('Announcements: Found navigation/header to insert after:', sel);
                        break;
                    }
                }

                if (target) {
                    target.insertAdjacentElement('afterend', bar);
                    bar.style.display = 'block';
                    return true;
                }
                
                return false;
            };

            // Try inserting immediately
            if (insert()) return;

            // Poll if not found (waiting for JS rendering)
            const interval = setInterval(() => {
                retries++;
                const success = insert();
                if (success || retries >= POLL_MAX_RETRIES) {
                    clearInterval(interval);
                    if (!success) {
                        // Fallback: Insert at the top of the app/root or body
                        console.log('Announcements: Nav/Header not found, using fallback insertion.');
                        const app = document.getElementById('root') || document.getElementById('app') || document.body;
                        if (app.firstChild) {
                             app.insertBefore(bar, app.firstChild);
                        } else {
                             app.appendChild(bar);
                        }
                        bar.style.display = 'block';
                    }
                }
            }, POLL_INTERVAL);

        } catch (e) {
            console.error('Failed to initialize announcements:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
