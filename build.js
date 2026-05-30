const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const DIST = path.join(__dirname, 'dist');
const CONTENT = path.join(__dirname, 'content');
const TEMPLATES = path.join(__dirname, 'templates');
const STATIC = path.join(__dirname, 'static');
const ADMIN = path.join(__dirname, 'admin');

// Clean and create dist
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });

// Load content JSON
function loadContent(name) {
  return JSON.parse(fs.readFileSync(path.join(CONTENT, `${name}.json`), 'utf-8'));
}

const global = loadContent('global');
const homepage = loadContent('homepage');
const gallery = loadContent('gallery');
const services = loadContent('services');
const about = loadContent('about');
const contact = loadContent('contact');

// ========================================
// HOMEPAGE (index.html)
// ========================================
function buildHomepage() {
  let html = fs.readFileSync(path.join(TEMPLATES, 'index.html'), 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });

  // Hero section
  const heroWrapper = $('section.relative').first();
  heroWrapper.find('span.font-label-caps').first().text(homepage.hero.tagline);
  heroWrapper.find('h1').first().text(homepage.hero.title);
  const heroCtaText = heroWrapper.find('a[href="services.html"]').first();
  if (heroCtaText.length) {
    heroCtaText.html(`${homepage.hero.ctaText} <span class="material-symbols-outlined text-sm">north_east</span>`);
  }

  // Story section
  const storySection = $('section').filter(function() {
    return $(this).find('span.font-label-caps').text().trim().includes('Our Story');
  }).first();
  if (storySection.length) {
    storySection.find('span.font-label-caps').first().text(homepage.story.label);
    storySection.find('h2').first().text(homepage.story.title);
    storySection.find('.space-y-6 p').each(function(i) {
      if (homepage.story.paragraphs[i]) {
        $(this).text(homepage.story.paragraphs[i]);
      }
    });
    const storyBtn = storySection.find('a.bg-primary-container').first();
    if (storyBtn.length) storyBtn.text(homepage.story.ctaText);
  }

  // Expertise section elements have been removed from templates/index.html
  // const expertiseSection = $('section.bg-\\[\\#1B2B22\\]').first();
  // if (expertiseSection.length) {
  //   expertiseSection.find('span.font-label-caps').first().text(homepage.expertise.label);
  //   const titleEl = expertiseSection.find('h2').first();
  //   if (titleEl.length) titleEl.text(homepage.expertise.title);
  //   const descEl = expertiseSection.find('p.font-body-lg').first();
  //   if (descEl.length) descEl.text(homepage.expertise.description);
  //   const expBtn = expertiseSection.find('a.bg-primary-container').first();
  //   if (expBtn.length) expBtn.text(homepage.expertise.ctaText);
  // }

  // Team section - update names
  homepage.team.forEach((member, i) => {
    const teamCards = $('section').find('.aspect-\\[3\\/4\\]');
    if (teamCards.eq(i).length) {
      teamCards.eq(i).find('h3').text(member.name);
      teamCards.eq(i).find('img').attr('alt', member.name);
      teamCards.eq(i).find('img').attr('src', member.image);
    }
  });

  // CTA section
  const ctaSection = $('section.bg-surface-container-low').first();
  if (ctaSection.length) {
    ctaSection.find('h2').text(homepage.cta.title);
    ctaSection.find('p').text(homepage.cta.description);
    ctaSection.find('a').text(homepage.cta.buttonText);
  }

  fs.writeFileSync(path.join(DIST, 'index.html'), $.html());
  console.log('✓ Built index.html');
}

// ========================================
// GALLERY (gallery.html)
// ========================================
function buildGallery() {
  let html = fs.readFileSync(path.join(TEMPLATES, 'gallery.html'), 'utf-8');
  
  // Replace the quote first to keep the typewriter script intact
  const oldQuote = "The hunt is only half the story; the brotherhood formed in the silence of the bush is what remains.";
  html = html.replace(oldQuote, gallery.hero.quote);

  const $ = cheerio.load(html, { decodeEntities: false });

  // Update gallery heading
  $('h2.font-display-lg').text(gallery.heading);
  
  // Update Hero Label
  const heroLabel = $('span.font-label-caps.text-secondary-container').first();
  if (heroLabel.length) heroLabel.text(gallery.hero.label);

  // Rebuild gallery grid
  const bentoGrid = $('section.bento-grid');
  if (bentoGrid.length) {
    bentoGrid.empty();
    gallery.images.forEach((img) => {
      const objectPos = img.objectPosition ? ` object-[${img.objectPosition}]` : ' object-center';
      const grayscale = img.effect === 'grayscale' ? ' grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-105' : ' transition-transform duration-700 group-hover:scale-105';
      const imgHtml = `
        <div class="col-span-1 md:col-span-${img.colSpan} h-auto md:h-[${img.height}px] overflow-hidden group">
          <img class="w-full h-auto md:h-full md:object-cover${objectPos}${grayscale}" 
               src="${img.src}" alt="Gallery image" loading="lazy"/>
        </div>`;
      bentoGrid.append(imgHtml);
    });
  }

  fs.writeFileSync(path.join(DIST, 'gallery.html'), $.html());
  console.log('✓ Built gallery.html');
}

// ========================================
// ABOUT (about.html)
// ========================================
function buildAbout() {
  let html = fs.readFileSync(path.join(TEMPLATES, 'about.html'), 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });

  // Story paragraphs
  const storyContainer = $('main .space-y-6').first();
  if (storyContainer.length) {
    const parentSection = storyContainer.closest('section');
    parentSection.find('span.font-label-caps').first().text(about.story.label);
    parentSection.find('h2.font-display-lg').first().text(about.story.title);
    
    storyContainer.find('p').each(function(i) {
      if (about.story.paragraphs[i]) {
        $(this).text(about.story.paragraphs[i]);
      }
    });
  }

  // Team members - update name, role, bio
  about.team.forEach((member, i) => {
    // Find team cards by looking for the group container
    const teamCards = $('main .grid').first().find('.group');
    if (teamCards.eq(i).length) {
      const card = teamCards.eq(i);
      card.find('h3').text(member.name);
      card.find('span.font-label-caps').text(member.role);
      card.find('p').text(member.bio);
      card.find('img').attr('alt', member.name);
      card.find('img').attr('src', member.image);
    }
  });

  fs.writeFileSync(path.join(DIST, 'about.html'), $.html());
  console.log('✓ Built about.html');
}

// ========================================
// CONTACT (contact.html)
// ========================================
function buildContact() {
  let html = fs.readFileSync(path.join(TEMPLATES, 'contact.html'), 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });
  
  // Hero
  const heroWrapper = $('section').first();
  heroWrapper.find('span.font-label-caps').text(contact.hero.label);
  heroWrapper.find('h1').text(contact.hero.title);
  heroWrapper.find('p').text(contact.hero.description);
  
  // Form Header
  const formHeader = $('div.space-y-4').first();
  formHeader.find('h2').text(contact.form.title);
  formHeader.find('p').text(contact.form.description);

  // Simple string replacements for contact details
  html = $.html();
  html = html.replace(/@huntingwithprochef/g, contact.channels.instagram.handle);
  html = html.replace(/https:\/\/www\.instagram\.com\/[^"]+/g, contact.channels.instagram.url);
  html = html.replace(/\+64 27 382 4866/g, contact.channels.whatsapp.number);
  html = html.replace(/https:\/\/wa\.me\/[^"]+/g, contact.channels.whatsapp.url);
  html = html.replace(/jacobjosemon@gmail\.com/g, contact.channels.email.address);

  // Replace formspree ID
  html = html.replace(/mqenprll/g, contact.form.formspreeId);

  fs.writeFileSync(path.join(DIST, 'contact.html'), html);
  console.log('✓ Built contact.html');
}

// ========================================
// SERVICES (services.html)
// ========================================
function buildServices() {
  let html = fs.readFileSync(path.join(TEMPLATES, 'services.html'), 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });

  // Update hero text
  const heroWrapper = $('section').first();
  heroWrapper.find('span.font-label-caps').text(services.hero.label);
  heroWrapper.find('h1').text(services.hero.title);
  heroWrapper.find('p').text(services.hero.description);

  // Update Section Header
  const sectionHeader = $('section.max-w-screen-2xl').first().find('.text-center').first();
  sectionHeader.find('span.font-label-caps').text(services.sectionLabel);
  sectionHeader.find('h2').text(services.sectionTitle);

  // Helper to generate list items
  const generateList = (items, icon, iconColor, isLiText = false) => {
    return (items || []).map(item => `
      <li class="flex items-${isLiText ? 'center' : 'start'} gap-4"><span class="material-symbols-outlined text-${iconColor} ${isLiText ? '' : 'text-xl'}">${icon}</span> ${item}</li>
    `).join('');
  };

  services.packages.forEach((pkg) => {
    const section = $(`#${pkg.id}`);
    if (!section.length) return;

    // Header text
    section.find('span.font-label-caps').first().text(pkg.label);
    section.find('h2').first().text(pkg.title);
    
    // Offer card
    const offerCards = section.find('.border-l-4');
    offerCards.each(function() {
      if ($(this).find('h3').text().includes('OFFER!')) {
        $(this).find('h3').text(pkg.offerCard?.heading || 'WHAT WE OFFER!');
        $(this).find('p').eq(0).text(pkg.offerCard?.duration || '');
        $(this).find('p').eq(1).text(pkg.offerCard?.bonus || '');
      }
    });

    if (pkg.id === 'package-nz') {
      section.find('h3.italic').text(pkg.subtitle);
      section.find('p.leading-relaxed').first().text(pkg.description);
      
      const uls = section.find('ul');
      uls.eq(0).html(generateList(pkg.inclusions, 'check_circle', 'secondary'));
      uls.eq(1).html(generateList(pkg.beginnerFeatures, 'verified', 'secondary', true));
      uls.eq(2).html(
        (pkg.gameSpecies || []).map(item => `<li class="flex items-center gap-4 text-secondary"><span class="material-symbols-outlined">target</span> ${item}</li>`).join('') +
        `<li class="text-on-surface-variant/60 font-normal italic text-sm">${pkg.gameNote}</li>`
      );
      
      const whyChoose = section.find('.bg-surface-variant\\/30');
      whyChoose.find('h3').text(pkg.whyChoose?.heading);
      whyChoose.find('ul').html(generateList(pkg.whyChoose?.points, 'star', 'secondary', true).replace(/text-xl/g, 'text-xs'));
      whyChoose.find('div.border-t').text(pkg.whyChoose?.note);

    } else if (pkg.id === 'package-africa') {
      section.find('p.leading-relaxed').first().text(pkg.description);
      
      const uls = section.find('ul');
      const inclusionsHtml = generateList(pkg.inclusions, 'check_circle', 'secondary');
      const beginnerBox = `
        <li class="mt-12 p-6 bg-white/5 border border-white/10 rounded">
          <h4 class="font-label-caps text-secondary uppercase text-xs mb-3 font-bold tracking-widest">${pkg.beginnerNote?.heading}</h4>
          <p class="text-sm text-white font-bold mb-3 italic">${pkg.beginnerNote?.subtitle}</p>
          <ul class="space-y-2 text-sm text-white/70">
            ${(pkg.beginnerNote?.points || []).map(p => `<li class="flex items-center gap-2">• ${p}</li>`).join('')}
          </ul>
        </li>`;
      uls.eq(0).html(inclusionsHtml + beginnerBox);
      
      uls.eq(2).html(generateList(pkg.huntingIncluded, 'check_circle', 'secondary', true));
      uls.eq(3).html(generateList(pkg.additionalBigGame, 'add_circle', 'secondary', true));

    } else if (pkg.id === 'package-namibia') {
      const uls = section.find('ul');
      
      const inclusionsHtml = generateList(pkg.inclusions, 'check_circle', 'secondary');
      const extraItems = `
        <li class="flex items-start gap-4 p-4 bg-surface-variant/50 border-l-4 border-secondary text-primary font-medium">
          <span class="material-symbols-outlined text-secondary text-xl">check_circle</span> ${pkg.highlightedInclusion}
        </li>
        <li class="flex items-start gap-4 text-on-surface-variant/60 italic text-sm">
          <span class="material-symbols-outlined text-xl opacity-40">info</span> ${pkg.inclusionNote}
        </li>`;
      uls.eq(0).html(inclusionsHtml + extraItems);
      
      uls.eq(1).html(generateList(pkg.huntingIncluded, 'check_circle', 'secondary', true));
    }
  });

  fs.writeFileSync(path.join(DIST, 'services.html'), $.html());
  console.log('✓ Built services.html');
}

// ========================================
// Copy static assets
// ========================================
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ========================================
// RUN BUILD
// ========================================
buildHomepage();
buildGallery();
buildAbout();
buildContact();
buildServices();

copyDir(STATIC, DIST);
console.log('✓ Copied static assets');

if (fs.existsSync(ADMIN)) {
  copyDir(ADMIN, path.join(DIST, 'admin'));
  console.log('✓ Copied admin dashboard');
}

console.log('\n🏁 Build complete → dist/');
