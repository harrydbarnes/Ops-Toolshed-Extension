// features/placement-counter.js

(function() {
let toastTimeout;
let currentToast = null;

function showToast(message) {
if (currentToast) {
document.body.removeChild(currentToast);
}

currentToast = document.createElement('div');
currentToast.className = 'placement-toast show'; // Immediately show
currentToast.textContent = message;
document.body.appendChild(currentToast);

clearTimeout(toastTimeout);
toastTimeout = setTimeout(() => {
if (currentToast) {
currentToast.classList.remove('show');
// Use a short delay for animation before removing from DOM
setTimeout(() => {
if (currentToast && currentToast.parentElement) {
document.body.removeChild(currentToast);
}
currentToast = null;
}, 300);
}
}, 3000);
}

function hideToast() {
if (currentToast) {
currentToast.classList.remove('show');
setTimeout(() => {
if (currentToast && currentToast.parentElement) {
document.body.removeChild(currentToast);
}
currentToast = null;
}, 300);
}
}

function countSelectedPlacements() {
// FIX: Explicitly search within the grid element for robustness
const gridContainer = document.querySelector('#grid-container_hot');
if (!gridContainer) {
hideToast();
return;
}

const selectedCheckboxes = gridContainer.querySelectorAll('input.mo-row-checkbox[type="checkbox"]:checked');
const count = selectedCheckboxes.length;

if (count > 0) {
const message = `${count} Placement${count > 1 ? 's' : ''} Selected`;
showToast(message);
} else {
hideToast();
}
}

// Refactored to be called externally
function initializePlacementCounter() {
// Add some basic styling for the toast, guarding against duplicate injection
const styleId = 'placement-counter-style';
if (!document.getElementById(styleId)) {
const style = document.createElement('style');
style.id = styleId;
style.textContent = `
.placement-toast {
position: fixed;
bottom: 20px;
left: 20px;
background-color: #333;
color: white;
padding: 10px 20px;
border-radius: 5px;
z-index: 2147483647;
font-family: 'Outfit', sans-serif;
font-size: 14px;
font-weight: 500;
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
opacity: 0;
transform: translateY(20px);
transition: opacity 0.3s ease, transform 0.3s ease;
visibility: hidden;
}

.placement-toast.show {
opacity: 1;
transform: translateY(0);
visibility: visible;
}
`;
document.head.appendChild(style);
}

chrome.storage.sync.get('countPlacementsSelectedEnabled', (data) => {
// NOTE: The listener is only attached if the feature is enabled in settings.
if (data.countPlacementsSelectedEnabled) {
// Attach listener to the document body for robust delegation
document.body.addEventListener('change', (event) => {
// 1. Check if the target is the correct checkbox class
if (event.target.classList.contains('mo-row-checkbox')) {
// 2. Check if the checkbox is inside the main placement grid
const isInsideTargetGrid = event.target.closest('#grid-container_hot');
if (isInsideTargetGrid) {
countSelectedPlacements();
}
}
}, { once: false });
}
});
}

// Expose the interface to be managed by content.js
window.placementCounterFeature = {
initialize: initializePlacementCounter
};
})();
