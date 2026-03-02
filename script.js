// DOM Elements
const masonryWrapper = document.querySelector('.masonry-wrapper');
const masonryContainer = document.querySelector('.masonry-container');
const contentWrapper = document.getElementById('contentWrapper');
const howItWorks = document.getElementById('howItWorks');
const gradientOverlay = document.querySelector('.masonry-gradient-overlay');

// Animation Constants
const MAX_SCROLL = 800; // Pixels to scroll for full animation (Phase 1: content + rotation)
const MASONRY_PAUSE_SCROLL = 200; // Additional scroll to view static masonry (Phase 2) - reduced
const MASONRY_FADEOUT_SCROLL = 600; // Scroll distance for masonry fade-out (Phase 3) - increased
const INITIAL_ROTATION = -10; // Initial Z-axis rotation in degrees (2D rotation)
const INITIAL_WIDTH = 45; // Initial content width percentage

// Handle scroll events with progressive animation
let ticking = false;

function handleScroll() {
    const scrollY = window.scrollY;
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        // Reset styles for mobile to ensure natural document flow
        masonryWrapper.style.position = 'relative';
        masonryWrapper.style.top = '0';
        masonryWrapper.style.opacity = '1';
        contentWrapper.style.position = 'relative';
        contentWrapper.style.width = '100%';
        contentWrapper.style.height = 'auto';
        contentWrapper.style.opacity = '1';
        masonryContainer.style.transform = 'translate(-50%, -50%) rotate(0deg)';
        const content = document.querySelector('.content');
        if (content) {
            content.style.clipPath = 'none';
            content.style.position = 'relative';
            content.style.left = '0';
            content.style.bottom = '0';
            content.style.width = '100%';
        }
        return;
    }

    // PHASE 1: Content disappears + Rotation (0px to MAX_SCROLL)
    const phase1Progress = Math.min(scrollY / MAX_SCROLL, 1);

    // Calculate rotation: from INITIAL_ROTATION to 0deg
    const rotation = INITIAL_ROTATION * (1 - phase1Progress);

    // Calculate content width: from 45% to 0%
    const contentWidth = INITIAL_WIDTH * (1 - phase1Progress);

    // Apply transforms to masonry and content
    masonryContainer.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    contentWrapper.style.width = `${contentWidth}%`;

    // Calculate clip-path for content to create clipping effect
    // Content is fixed at viewport, clipped by the shrinking container from LEFT to RIGHT
    const content = document.querySelector('.content');
    const viewportWidth = window.innerWidth;
    const containerWidthPx = (contentWidth / 100) * viewportWidth;

    // Initial container width at 45% viewport
    const initialContainerWidth = (INITIAL_WIDTH / 100) * viewportWidth;

    // As container shrinks from right, clip more from the LEFT
    // clipLeft increases as containerWidthPx decreases
    const clipLeft = Math.max(0, initialContainerWidth - containerWidthPx - 50); // 50px is left padding
    if (content) content.style.clipPath = `inset(0 0 0 ${clipLeft}px)`; // inset(top right bottom LEFT)

    // Hide initial content completely when width is very small
    if (contentWidth < 5) {
        contentWrapper.style.opacity = '0';
        contentWrapper.style.pointerEvents = 'none';
    } else {
        contentWrapper.style.opacity = '1';
        contentWrapper.style.pointerEvents = 'auto';
    }

    // PHASE 2: Static Masonry Viewing (MAX_SCROLL to MAX_SCROLL + MASONRY_PAUSE_SCROLL)
    // Masonry stays at full opacity, no changes
    const phase2Start = MAX_SCROLL;
    const phase2End = MAX_SCROLL + MASONRY_PAUSE_SCROLL;

    if (scrollY >= phase2Start) {
        // Change masonry to absolute positioning so it scrolls with the page
        masonryWrapper.style.position = 'absolute';
        masonryWrapper.style.top = `${phase2Start}px`;
    } else {
        // Keep masonry fixed during Phase 1
        masonryWrapper.style.position = 'fixed';
        masonryWrapper.style.top = '0';
    }

    ticking = false;
}

window.addEventListener('scroll', () => {
    if (!ticking) {
        window.requestAnimationFrame(handleScroll);
        ticking = true;
    }
});

// Update window resize handler to jump to correct state
window.addEventListener('resize', () => {
    handleScroll();
});

// Duplicate images for infinite scroll effect (Triple Clone Strategy)
function duplicateImages() {
    const columns = document.querySelectorAll('.masonry-column, .cta-masonry-column');

    columns.forEach(column => {
        const images = Array.from(column.querySelectorAll('img'));
        // Clone all images twice and append them for a seamless triple loop
        // Set 1 (original) | Set 2 (clone) | Set 3 (clone)
        for (let i = 0; i < 2; i++) {
            images.forEach(img => {
                const clone = img.cloneNode(true);
                column.appendChild(clone);
            });
        }
    });
}

// Initialize
duplicateImages();

// CTA Button click handler
const ctaButtons = document.querySelectorAll('.cta-button');
ctaButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        window.open('https://www.figma.com/community/plugin/1603792827026673789', '_blank');
    });
});

// Initial state
handleScroll();
