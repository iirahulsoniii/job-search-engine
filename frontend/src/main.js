import './style.css';

const jobsContainer = document.getElementById('jobs-container');
const statusElement = document.getElementById('status');
const searchBtn = document.getElementById('search-btn');
const keywordInput = document.getElementById('keyword-input');
const locationInput = document.getElementById('location-input');
const postedInput = document.getElementById('posted-input');
const visaFilter = document.getElementById('visa-filter');
const expCheckboxes = document.querySelectorAll('.exp-checkbox');
const portalCheckboxes = document.querySelectorAll('.portal-checkbox');

let currentJobs = [];

// Icons
const locationIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
const timeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
const starIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

function renderSkeletons(count = 10) {
  jobsContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'job-card glass';
    skeleton.innerHTML = `
      <div class="job-main-info" style="width:100%">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-company"></div>
          <div class="skeleton skeleton-details"></div>
      </div>
      <div class="card-actions" style="width:200px">
          <div class="skeleton skeleton-btn"></div>
          <div class="skeleton skeleton-btn"></div>
      </div>
    `;
    jobsContainer.appendChild(skeleton);
  }
}

async function handleGenerateCoverLetter(job, buttonElement) {
  const originalText = buttonElement.textContent;
  buttonElement.textContent = 'Generating...';
  buttonElement.disabled = true;
  
  try {
    const response = await fetch('http://localhost:5000/api/cover-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: job.link, company: job.company, title: job.title })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    statusElement.textContent = `Success! Cover letter saved in ${data.folderPath}`;
    statusElement.className = 'status success';
    buttonElement.textContent = 'Generated!';
  } catch (error) {
    console.error('Error:', error);
    statusElement.textContent = error.message;
    statusElement.className = 'status error';
    buttonElement.textContent = 'Failed';
    setTimeout(() => {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
    }, 3000);
  }
}

async function handleCalculateScore(job, scoreBtnElement) {
  scoreBtnElement.innerHTML = `Calculating...`;
  scoreBtnElement.disabled = true;
  
  try {
    const response = await fetch('http://localhost:5000/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: job.link })
    });
    const data = await response.json();
    
    job.matchScore = data.score;
    if (job.matchScore !== 'N/A' && job.matchScore !== 'Error') {
        const score = parseInt(job.matchScore);
        let scoreClass = 'med';
        if (score >= 80) scoreClass = 'high';
        else if (score < 50) scoreClass = 'low';
        scoreBtnElement.className = `match-score ${scoreClass}`;
        scoreBtnElement.innerHTML = `${starIcon} ${score}% Match`;
    } else {
        scoreBtnElement.className = `match-score`;
        scoreBtnElement.innerHTML = `Match N/A`;
    }
  } catch (e) {
    scoreBtnElement.innerHTML = `Match N/A`;
  }
}

function updateCompanyFilters() {
  const companyFilterList = document.getElementById('company-filter-list');
  if (!companyFilterList) return;
  
  const uniqueCompanies = [...new Set(currentJobs.map(job => job.company))].sort();
  companyFilterList.innerHTML = '';
  
  if (uniqueCompanies.length === 0) {
      companyFilterList.innerHTML = '<p style="color: #a0aec0; font-size: 0.85rem; padding: 0.25rem;">Companies will appear here after search.</p>';
      return;
  }
  
  uniqueCompanies.forEach(company => {
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      label.innerHTML = `<input type="checkbox" value="${company}" class="company-checkbox"> <span class="custom-checkbox"></span>${company}`;
      
      const cb = label.querySelector('input');
      cb.addEventListener('change', renderJobs);
      companyFilterList.appendChild(label);
  });
}

function renderJobs() {
  jobsContainer.innerHTML = '';
  
  const reqVisa = visaFilter.checked;
  const activeExps = Array.from(expCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
  const companyCheckboxes = document.querySelectorAll('.company-checkbox');
  const activeCompanies = Array.from(companyCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
  
  const filteredJobs = currentJobs.filter(job => {
      if (reqVisa && !job.visaSponsorship) return false;
      
      if (activeExps.length > 0 && !activeExps.includes('any')) {
          const match = job.experience.match(/\d+/);
          const years = match ? parseInt(match[0]) : null;
          
          let matchesExp = false;
          if (activeExps.includes('not_mentioned') && years === null) matchesExp = true;
          if (activeExps.includes('junior') && years !== null && years <= 2) matchesExp = true;
          if (activeExps.includes('mid') && years !== null && years >= 3 && years <= 5) matchesExp = true;
          if (activeExps.includes('senior') && years !== null && years > 5) matchesExp = true;
          
          if (!matchesExp) return false;
      }
      
      if (activeCompanies.length > 0 && !activeCompanies.includes(job.company)) {
          return false;
      }
      
      return true;
  });
  
  if (filteredJobs.length === 0) {
    statusElement.textContent = 'No jobs found matching your filters.';
    statusElement.className = 'status';
    return;
  }
  
  statusElement.textContent = `Showing ${filteredJobs.length} roles from multiple portals.`;
  statusElement.className = 'status';
  
  filteredJobs.forEach((job, index) => {
    const card = document.createElement('div');
    card.className = 'job-card glass';
    card.style.animation = `fadeIn 0.5s ease forwards ${index * 0.05}s`;
    card.style.opacity = '0';
    
    const visaBadge = job.visaSponsorship ? '<span class="badge">Visa Sponsored</span>' : '';
    const expBadge = `<span class="badge ${job.experience === 'Not mentioned' ? 'warning' : ''}">Exp: ${job.experience}</span>`;
    
    let portalColor = '#0077b5'; // LinkedIn
    if (job.source === 'Remotive') portalColor = '#fbbf24';
    if (job.source === 'Arbeitnow') portalColor = '#34d399';
    if (job.source === 'RemoteOK') portalColor = '#ef4444';
    if (job.source === 'Indeed') portalColor = '#2563eb';
    if (job.source === 'Seek') portalColor = '#e11d48';
    if (job.source === 'Jora') portalColor = '#9333ea';
    
    let scoreBadge = '';
    if (job.matchScore) {
        const score = parseInt(job.matchScore);
        let scoreClass = 'med';
        if (score >= 80) scoreClass = 'high';
        else if (score < 50) scoreClass = 'low';
        scoreBadge = `<div class="match-score ${scoreClass}">${starIcon} ${score}% Match</div>`;
    } else {
        scoreBadge = `<button class="match-score calculate-btn">${starIcon} Score Match</button>`;
    }
    
    card.innerHTML = `
      <div class="job-main-info">
          <div class="job-header-flex">
              <h2 class="job-title">${job.title}</h2>
              <span class="portal-badge" style="background:${portalColor}">${job.source}</span>
          </div>
          <div class="job-company">${job.company}</div>
          <div class="job-details">
            <span>${locationIcon} ${job.location}</span>
            <span>${timeIcon} ${job.time || 'Recently'}</span>
            ${expBadge}
            ${visaBadge}
          </div>
      </div>
      <div class="card-actions">
        ${scoreBadge}
        <button class="generate-btn">AI Cover Letter</button>
        <a href="${job.link}" target="_blank" rel="noopener noreferrer" class="apply-btn">Apply Now</a>
      </div>
    `;
    
    const generateBtn = card.querySelector('.generate-btn');
    generateBtn.addEventListener('click', () => handleGenerateCoverLetter(job, generateBtn));
    
    const calcBtn = card.querySelector('.calculate-btn');
    if (calcBtn) {
        calcBtn.addEventListener('click', () => handleCalculateScore(job, calcBtn));
    }
    
    jobsContainer.appendChild(card);
  });
}

async function fetchJobs() {
  const keyword = keywordInput.value;
  const location = locationInput.value;
  const posted = postedInput.value;
  const activePortals = Array.from(portalCheckboxes).filter(cb => cb.checked).map(cb => cb.value).join(',');
  
  renderSkeletons(15);
  statusElement.textContent = 'Fetching jobs from all selected portals...';
  statusElement.className = 'status';
  searchBtn.disabled = true;
  
  try {
    const reqVisa = visaFilter.checked;
    const params = new URLSearchParams({ keyword, location, posted, portals: activePortals, visa: reqVisa });
    const response = await fetch(`http://localhost:5000/api/jobs?${params}`);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    currentJobs = data.jobs || [];
    updateCompanyFilters();
    renderJobs();
  } catch (error) {
    console.error('Error:', error);
    statusElement.textContent = 'Failed to load jobs. Check backend server and API limits.';
    statusElement.className = 'status error';
    jobsContainer.innerHTML = '';
  } finally {
      searchBtn.disabled = false;
  }
}

// Add CSS animation for staggered fade in
const style = document.createElement('style');
style.innerHTML = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .calculate-btn {
      background: transparent;
      color: var(--text-main);
      cursor: pointer;
      border: 1px dashed var(--border-color);
  }
  .calculate-btn:hover {
      background: rgba(255,255,255,0.05);
  }
`;
document.head.appendChild(style);

// Event Listeners
searchBtn.addEventListener('click', fetchJobs);
visaFilter.addEventListener('change', renderJobs);
expCheckboxes.forEach(cb => cb.addEventListener('change', renderJobs));
portalCheckboxes.forEach(cb => cb.addEventListener('change', fetchJobs));

// Initialize with default search
fetchJobs();
