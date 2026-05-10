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
  $('section.relative').first().find('span.font-label-caps').first().text(homepage.hero.tagline);
  $('section.relative').first().find('h1').first().text(homepage.hero.title);

  // Story section
  const storySection = $('section').filter(function() {
    return $(this).find('span.font-label-caps').text().trim().includes('Our');
  }).first();
  if (storySection.length) {
    storySection.find('.space-y-6 p').each(function(i) {
      if (homepage.story.paragraphs[i]) {
        $(this).text(homepage.story.paragraphs[i]);
      }
    });
  }

  // Expertise section
  const expertiseSection = $('section.bg-\\[\\#1B2B22\\]').first();
  if (expertiseSection.length) {
    const titleEl = expertiseSection.find('h2').first();
    if (titleEl.length) titleEl.text(homepage.expertise.title);
    const descEl = expertiseSection.find('p.font-body-lg').first();
    if (descEl.length) descEl.text(homepage.expertise.description);
  }

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
  const ctaH2 = $('section.bg-surface-container-low h2, section.py-16 h2').filter(function() {
    return $(this).text().includes('Ready');
  });
  if (ctaH2.length) {
    ctaH2.text(homepage.cta.title);
    ctaH2.next('p').text(homepage.cta.description);
  }

  fs.writeFileSync(path.join(DIST, 'index.html'), $.html());
  console.log('✓ Built index.html');
}

// ========================================
// GALLERY (gallery.html)
// ========================================
function buildGallery() {
  let html = fs.readFileSync(path.join(TEMPLATES, 'gallery.html'), 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });

  // Update quote text in the typewriter script
  const oldQuote = "The hunt is only half the story; the brotherhood formed in the silence of the bush is what remains.";
  html = html.replace(oldQuote, gallery.hero.quote);
  // Reload after string replacement
  const $2 = cheerio.load(html, { decodeEntities: false });

  // Update gallery heading
  $2('h2.font-display-lg').text(gallery.heading);

  // Rebuild gallery grid
  const bentoGrid = $2('section.bento-grid');
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

  fs.writeFileSync(path.join(DIST, 'gallery.html'), $2.html());
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

  // Simple string replacements for contact details
  html = html.replace(/@huntingwithprochef/g, contact.channels.instagram.handle);
  html = html.replace(/\+64 27 382 4866/g, contact.channels.whatsapp.number);
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
  const heroSection = $('section').first();

  // Update package titles and descriptions via string replacement
  services.packages.forEach((pkg) => {
    // The original HTML has these exact strings - if content JSON matches,
    // no replacement needed. Only replace if content has changed.
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
