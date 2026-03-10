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

// Identity Portal Logic
let currentWeekOffset = 0;
let selectedSlot = null;
// Initialized via ctaButtons below

// Neural Scheduler Logic
let activeDate = null; // Currently selected date object

function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    const weekDisplay = document.getElementById('weekDisplay');
    calendarGrid.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate Monday of the target week
    const startOfWeek = new Date();
    const dayOfWeek = startOfWeek.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday + (currentWeekOffset * 7));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 4); // Friday

    weekDisplay.textContent = `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    // 1. Create Days Row
    const daysRow = document.createElement('div');
    daysRow.className = 'days-row';

    let firstAvailableDate = null;

    for (let i = 0; i < 5; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);

        const dayCard = document.createElement('div');
        dayCard.className = 'day-card';

        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = date.getDate();
        const fullDateStr = date.toDateString();

        // Check if day should be disabled (past or after 4pm today)
        const isDisabled = isDayDisabled(date);
        if (isDisabled) {
            dayCard.classList.add('disabled');
        } else if (!firstAvailableDate) {
            firstAvailableDate = date;
        }

        // Set active date if matches (or default to first available)
        if (activeDate && activeDate.toDateString() === fullDateStr) {
            dayCard.classList.add('active');
        }

        dayCard.innerHTML = `
            <span class="day-name">${dayName}</span>
            <span class="day-number">${dayNum}</span>
        `;

        if (!isDisabled) {
            dayCard.onclick = () => {
                activeDate = new Date(date);
                renderCalendar(); // Re-render to update active state and slots
            };
        }

        daysRow.appendChild(dayCard);
    }

    calendarGrid.appendChild(daysRow);

    // Default to first available if none selected
    if (!activeDate && firstAvailableDate) {
        activeDate = firstAvailableDate;
        // Mark the card as active in DOM directly for visual consistency
        const cards = daysRow.querySelectorAll('.day-card:not(.disabled)');
        if (cards.length > 0) cards[0].classList.add('active');
    }

    // 2. Create Time Slots Grid
    if (activeDate) {
        const slotsContainer = document.createElement('div');
        slotsContainer.className = 'time-slots-container';
        slotsContainer.innerHTML = `
            <div class="time-slots-grid">
                ${generateTimeSlotHTML(activeDate)}
            </div>
        `;
        calendarGrid.appendChild(slotsContainer);

        // Attach slot click listeners
        slotsContainer.querySelectorAll('.time-slot').forEach(slot => {
            slot.onclick = (e) => {
                if (e.target.classList.contains('disabled')) return;
                slotsContainer.querySelectorAll('.time-slot').forEach(s => s.classList.remove('active'));
                e.target.classList.add('active');
                selectedSlot = {
                    date: e.target.dataset.date,
                    time: e.target.dataset.time
                };
            };
        });
    }
}

function isDayDisabled(date) {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If day is before today
    if (date < today) return true;

    // If day is today and it's after 6:00 PM (18:00)
    if (date.getTime() === today.getTime()) {
        if (now.getHours() >= 18) return true;
    }

    return false;
}

function generateTimeSlotHTML(date) {
    const slots = [
        "10:00 AM", "11:00 AM", "12:00 PM",
        "02:00 PM", "03:00 PM", "04:00 PM",
        "05:00 PM", "06:00 PM"
    ];

    return slots.map(time => {
        const isDisabled = isSlotDisabled(date, time);
        const activeClass = (selectedSlot && selectedSlot.date === date.toISOString() && selectedSlot.time === time) ? 'active' : '';

        return `<div class="time-slot ${isDisabled ? 'disabled' : ''} ${activeClass}" 
                     data-date="${date.toISOString()}" 
                     data-time="${time}">${time}</div>`;
    }).join('');
}

function isSlotDisabled(date, timeStr) {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // If day is in the past (already handled by day card, but good for safety)
    if (date < today) return true;

    // If day is today, check the specific hour
    if (date.getTime() === today.getTime()) {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier === 'PM') hours = parseInt(hours, 10) + 12;

        const slotTime = new Date();
        slotTime.setHours(hours, minutes, 0, 0);

        return slotTime <= now;
    }

    return false;
}

// Navigation
document.getElementById('prevWeek').addEventListener('click', () => {
    if (currentWeekOffset > 0) {
        currentWeekOffset--;
        renderCalendar();
    }
});

document.getElementById('nextWeek').addEventListener('click', () => {
    currentWeekOffset++;
    renderCalendar();
});

// CTA Button click handler
const ctaButtons = document.querySelectorAll('.cta-button');
ctaButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        openPortal();
    });
});

// Form Submission (Phase 3 Integration)
document.getElementById('onboardingForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const totalSize = attachedFiles.reduce((sum, file) => sum + file.size, 0);
    const maxSize = 4 * 1024 * 1024; // 4MB

    if (totalSize > maxSize) {
        alert("The total file size exceeds the 4MB limit for Strategy Documents. Please remove some files before continuing.");
        return;
    }

    if (!selectedSlot) {
        alert("Please select a session time.");
        return;
    }

    const submitBtn = document.querySelector('.portal-submit-btn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'BOOKING...';

    let result;
    try {
        const formData = new FormData(e.target);
        formData.append('selectedSlot', JSON.stringify(selectedSlot));

        // Add all attached files tracked in our state
        formData.delete('prdUpload'); // Remove the one from input field
        attachedFiles.forEach(file => {
            formData.append('prdUpload', file);
        });

        const response = await fetch('/api/book', {
            method: 'POST',
            body: formData
        });

        const text = await response.text();
        try {
            result = JSON.parse(text);
        } catch (err) {
            result = { error: 'Server returned non-JSON response.', details: text.substring(0, 200) };
        }

        if (response.ok) {
            submitBtn.innerHTML = 'BOOKING CONFIRMED';
            submitBtn.style.background = '#4CAF50';

            setTimeout(() => {
                // Show success section
                document.getElementById('portalFormSection').style.display = 'none';
                document.getElementById('portalSchedulerSection').style.display = 'none';
                const successSection = document.getElementById('portalSuccessSection');
                successSection.style.display = 'flex';

                // Update detail text
                if (result.booking) {
                    document.getElementById('confirmedSession').innerText = `${result.booking.date} at ${result.booking.time}`;
                }

                // Reset but keep successful state visible
                e.target.reset();
                attachedFiles = []; // Clear local list
                renderFileList();
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
                submitBtn.style = '';
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('active'));
                selectedSlot = null;
            }, 800);
        } else {
            throw new Error(result.error || 'Failed to initiate takeover');
        }
    } catch (error) {
        console.error("Booking failed:", error);
        const detailMsg = result && result.details ? `\n\nDetails: ${result.details}` : "";
        alert("The machine encountered an error: " + error.message + detailMsg);
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
});

// Portal controls (Spatial Transition Version)
function openPortal() {
    const portal = document.getElementById('identityPortal');
    const wrapper = document.getElementById('contentWrapper');

    // Phase 1: spatial hijack
    document.body.style.overflow = 'hidden';
    wrapper.classList.add('portal-transition-mode');
    wrapper.classList.add('portal-expansion-active');

    // Phase 2: revealed content
    setTimeout(() => {
        portal.classList.add('active');
        wrapper.classList.remove('portal-transition-mode');

        // Ensure sections are reset to default view
        document.getElementById('portalFormSection').style.display = 'block';
        document.getElementById('portalSchedulerSection').style.display = 'block';
        document.getElementById('portalSuccessSection').style.display = 'none';

        // Reset file label and list
        attachedFiles = [];
        renderFileList();

        renderCalendar();
    }, 800); // Wait for drawer expansion
}

function closePortal() {
    const portal = document.getElementById('identityPortal');
    const wrapper = document.getElementById('contentWrapper');

    // Phase 1: close content
    portal.classList.remove('active');

    // Phase 2: restore home architecture
    setTimeout(() => {
        wrapper.classList.add('portal-transition-mode');
        wrapper.classList.remove('portal-expansion-active');

        setTimeout(() => {
            wrapper.classList.remove('portal-transition-mode');
            document.body.style.overflow = '';
            // Re-calculate scroll positions immediately to avoid snap-jump
            handleScroll();
        }, 800);
    }, 400); // 400ms is standard for portal fade out
}

// File Upload handling (State-based Multiple Files)
let attachedFiles = [];

const fileInput = document.getElementById('prdUpload');
const dropZone = document.getElementById('dropZone');
const uploadMoreBtn = document.getElementById('uploadMoreBtn');
const fileListContainer = document.getElementById('fileList');

fileInput.addEventListener('change', (e) => {
    const newFiles = Array.from(e.target.files);
    attachedFiles = [...attachedFiles, ...newFiles];
    renderFileList();
    e.target.value = ''; // Reset input to allow re-upload if needed
});

// Trigger file input from "Upload more" button
uploadMoreBtn.addEventListener('click', () => {
    fileInput.click();
});

function getTotalFilesSize() {
    return attachedFiles.reduce((sum, file) => sum + file.size, 0);
}

function renderFileList() {
    fileListContainer.innerHTML = '';
    const totalSize = getTotalFilesSize();
    const maxSize = 4 * 1024 * 1024; // 4MB
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    const dropZoneLabel = document.getElementById('prdUploadLabel');

    if (attachedFiles.length === 0) {
        dropZone.style.display = 'block';
        uploadMoreBtn.style.display = 'none';
        dropZone.style.borderColor = '';
        dropZoneLabel.textContent = 'Drag & drop your PRD or Project Brief';
        dropZoneLabel.style.color = '';
        return;
    }

    dropZone.style.display = 'none';
    uploadMoreBtn.style.display = 'block';

    // Show size warning if needed
    if (totalSize > maxSize) {
        const errorMsg = document.createElement('div');
        errorMsg.style.color = '#ff4d4d';
        errorMsg.style.fontSize = '12px';
        errorMsg.style.marginBottom = '12px';
        errorMsg.style.textAlign = 'center';
        errorMsg.style.fontWeight = 'bold';
        errorMsg.textContent = `❌ LIMIT EXCEEDED: ${sizeInMB}MB of 4MB allowed. Please remove files.`;
        fileListContainer.appendChild(errorMsg);
        uploadMoreBtn.style.borderColor = '#ff4d4d';
        uploadMoreBtn.style.color = '#ff4d4d';
    } else {
        uploadMoreBtn.style.borderColor = '';
        uploadMoreBtn.style.color = '';
    }

    attachedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const ext = file.name.split('.').pop().toUpperCase();
        const iconType = (ext === 'PDF' || ext === 'DOC' || ext === 'DOCX' || ext === 'TXT') ? ext : 'DOC';

        item.innerHTML = `
            <div class="file-icon">${iconType}</div>
            <div class="file-info">
                <span class="file-name">${file.name}</span>
            </div>
            <button type="button" class="file-delete" onclick="removeAttachedFile(${index})">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        fileListContainer.appendChild(item);
    });
}

function removeAttachedFile(index) {
    attachedFiles.splice(index, 1);
    renderFileList();
}

// Attach removeAttachedFile to window for easier global access from inline onclick
window.removeAttachedFile = removeAttachedFile;

// Modify form submission to include all attached files
document.getElementById('onboardingForm').removeEventListener('submit', null); // Generic safety
// We keep the logic inside the existing listener but use the attachedFiles array

// Initial state
handleScroll();
