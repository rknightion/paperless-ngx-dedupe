/* SEO enhancements for Paperless NGX Dedupe documentation */

document.addEventListener('DOMContentLoaded', function() {
  addStructuredData();
  enhanceMetaTags();
  addOpenGraphTags();
  addTwitterCardTags();
  addCanonicalURL();
});

// Add JSON-LD structured data
function addStructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Paperless NGX Dedupe",
    "applicationCategory": "Document Management Software",
    "operatingSystem": "Docker / Node.js",
    "description": "A document deduplication companion for Paperless-NGX using MinHash/LSH algorithms with a web UI for reviewing and resolving duplicates",
    "url": "https://m7kni.io/paperless-ngx-dedupe/",
    "downloadUrl": "https://github.com/rknightion/paperless-ngx-dedupe",
    "softwareVersion": "latest",
    "programmingLanguage": [
      "TypeScript",
      "Svelte"
    ],
    "license": "https://github.com/rknightion/paperless-ngx-dedupe/blob/main/LICENSE",
    "author": {
      "@type": "Person",
      "name": "Rob Knighton",
      "url": "https://github.com/rknightion"
    },
    "maintainer": {
      "@type": "Person",
      "name": "Rob Knighton",
      "url": "https://github.com/rknightion"
    },
    "codeRepository": "https://github.com/rknightion/paperless-ngx-dedupe",
    "runtimePlatform": [
      "Node.js",
      "Docker"
    ],
    "applicationSubCategory": [
      "Document Deduplication",
      "Paperless-NGX Companion",
      "MinHash/LSH Algorithms"
    ],
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "screenshot": "https://m7kni.io/paperless-ngx-dedupe/assets/social-card.png",
    "featureList": [
      "MinHash/LSH duplicate detection",
      "Multi-dimensional similarity scoring",
      "Real-time SSE progress tracking",
      "REST API with TypeScript SDK",
      "Command-line interface",
      "Docker single-container deployment",
      "Side-by-side document comparison",
      "Batch operations for bulk processing"
    ]
  };

  const docData = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": document.title,
    "description": document.querySelector('meta[name="description"]')?.content || "Paperless NGX Dedupe documentation",
    "url": window.location.href,
    "datePublished": document.querySelector('meta[name="date"]')?.content,
    "dateModified": document.querySelector('meta[name="git-revision-date-localized"]')?.content,
    "author": {
      "@type": "Person",
      "name": "Rob Knighton"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Paperless NGX Dedupe",
      "url": "https://m7kni.io/paperless-ngx-dedupe/"
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": window.location.href
    },
    "articleSection": getDocumentationSection(),
    "keywords": getPageKeywords(),
    "about": {
      "@type": "SoftwareApplication",
      "name": "Paperless NGX Dedupe"
    }
  };

  const script1 = document.createElement('script');
  script1.type = 'application/ld+json';
  script1.textContent = JSON.stringify(structuredData);
  document.head.appendChild(script1);

  const script2 = document.createElement('script');
  script2.type = 'application/ld+json';
  script2.textContent = JSON.stringify(docData);
  document.head.appendChild(script2);
}

// Enhance existing meta tags
function enhanceMetaTags() {
  if (!document.querySelector('meta[name="robots"]')) {
    addMetaTag('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
  }

  addMetaTag('name', 'language', 'en');
  addMetaTag('http-equiv', 'Content-Type', 'text/html; charset=utf-8');

  if (!document.querySelector('meta[name="viewport"]')) {
    addMetaTag('name', 'viewport', 'width=device-width, initial-scale=1');
  }

  const keywords = getPageKeywords();
  if (keywords) {
    addMetaTag('name', 'keywords', keywords);
  }

  if (isDocumentationPage()) {
    addMetaTag('name', 'article:tag', 'paperless-ngx');
    addMetaTag('name', 'article:tag', 'deduplication');
    addMetaTag('name', 'article:tag', 'minhash');
    addMetaTag('name', 'article:tag', 'document-management');
  }
}

// Add Open Graph tags
function addOpenGraphTags() {
  const title = document.title || 'Paperless NGX Dedupe';
  const description = document.querySelector('meta[name="description"]')?.content ||
    'Document deduplication companion for Paperless-NGX using MinHash/LSH algorithms';
  const url = window.location.href;
  const siteName = 'Paperless NGX Dedupe Documentation';

  addMetaTag('property', 'og:type', 'website');
  addMetaTag('property', 'og:site_name', siteName);
  addMetaTag('property', 'og:title', title);
  addMetaTag('property', 'og:description', description);
  addMetaTag('property', 'og:url', url);
  addMetaTag('property', 'og:locale', 'en_US');
  addMetaTag('property', 'og:image', 'https://m7kni.io/paperless-ngx-dedupe/assets/social-card.png');
  addMetaTag('property', 'og:image:width', '1200');
  addMetaTag('property', 'og:image:height', '630');
  addMetaTag('property', 'og:image:alt', 'Paperless NGX Dedupe - Document deduplication for Paperless-NGX');
}

// Add Twitter Card tags
function addTwitterCardTags() {
  const title = document.title || 'Paperless NGX Dedupe';
  const description = document.querySelector('meta[name="description"]')?.content ||
    'Document deduplication companion for Paperless-NGX using MinHash/LSH algorithms';

  addMetaTag('name', 'twitter:card', 'summary_large_image');
  addMetaTag('name', 'twitter:title', title);
  addMetaTag('name', 'twitter:description', description);
  addMetaTag('name', 'twitter:image', 'https://m7kni.io/paperless-ngx-dedupe/assets/social-card.png');
  addMetaTag('name', 'twitter:creator', '@rknightion');
  addMetaTag('name', 'twitter:site', '@rknightion');
}

// Add canonical URL
function addCanonicalURL() {
  if (!document.querySelector('link[rel="canonical"]')) {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = window.location.href;
    document.head.appendChild(canonical);
  }
}

// Helper functions
function addMetaTag(attribute, name, content) {
  if (!document.querySelector(`meta[${attribute}="${name}"]`)) {
    const meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    meta.content = content;
    document.head.appendChild(meta);
  }
}

function getDocumentationSection() {
  const path = window.location.pathname;
  if (path.includes('/api-reference/')) return 'API Reference';
  if (path.includes('/sdk-reference/')) return 'SDK Reference';
  if (path.includes('/cli-reference/')) return 'CLI Reference';
  if (path.includes('/how-it-works/')) return 'How It Works';
  if (path.includes('/architecture/')) return 'Architecture';
  if (path.includes('/configuration/')) return 'Configuration';
  if (path.includes('/installation/')) return 'Installation';
  if (path.includes('/getting-started/')) return 'Getting Started';
  if (path.includes('/development/')) return 'Development';
  if (path.includes('/contributing/')) return 'Contributing';
  if (path.includes('/troubleshooting/')) return 'Troubleshooting';
  return 'Documentation';
}

function getPageKeywords() {
  const path = window.location.pathname;

  let keywords = ['paperless-ngx', 'deduplication', 'minhash', 'lsh', 'document-management'];

  if (path.includes('/api-reference/')) keywords.push('rest-api', 'endpoints', 'curl');
  if (path.includes('/sdk-reference/')) keywords.push('typescript', 'sdk', 'client-library');
  if (path.includes('/cli-reference/')) keywords.push('cli', 'command-line', 'terminal');
  if (path.includes('/how-it-works/')) keywords.push('algorithm', 'minhash', 'locality-sensitive-hashing', 'shingling');
  if (path.includes('/architecture/')) keywords.push('monorepo', 'sveltekit', 'sqlite', 'drizzle');
  if (path.includes('/configuration/')) keywords.push('configuration', 'environment-variables', 'docker');
  if (path.includes('/installation/')) keywords.push('installation', 'docker-compose', 'setup');
  if (path.includes('/getting-started/')) keywords.push('tutorial', 'quick-start', 'guide');
  if (path.includes('/development/')) keywords.push('development', 'contributing', 'testing');
  if (path.includes('/troubleshooting/')) keywords.push('troubleshooting', 'debugging', 'errors');

  return keywords.join(', ');
}

function isDocumentationPage() {
  return !window.location.pathname.endsWith('/') ||
         window.location.pathname.includes('/docs/');
}
