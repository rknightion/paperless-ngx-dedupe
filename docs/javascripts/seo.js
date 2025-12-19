/* SEO enhancements for Paperless-NGX Dedupe documentation */

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
    "name": "Paperless-NGX Dedupe",
    "applicationCategory": "Document Management Software",
    "operatingSystem": "Linux, Docker",
    "description": "A deduplication and AI metadata assistant for paperless-ngx with MinHash/LSH matching and OpenAI-powered suggestions",
    "url": "https://m7kni.io/paperless-ngx-dedupe/",
    "downloadUrl": "https://github.com/rknightion/paperless-ngx-dedupe",
    "softwareVersion": "latest",
    "programmingLanguage": "Python",
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
    "programmingLanguage": [
      "Python",
      "TypeScript",
      "Docker",
      "YAML"
    ],
    "runtimePlatform": [
      "Docker",
      "Linux"
    ],
    "applicationSubCategory": [
      "Document Deduplication",
      "Paperless-NGX",
      "AI Metadata Extraction"
    ],
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "screenshot": "https://m7kni.io/paperless-ngx-dedupe/assets/social-card.png",
    "featureList": [
      "MinHash and LSH-based duplicate detection",
      "OCR-aware fuzzy matching",
      "Bulk resolve workflows",
      "OpenAI metadata suggestions",
      "Paperless-NGX integration",
      "Real-time processing progress"
    ]
  };

  // Add documentation-specific structured data
  const docData = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": document.title,
    "description": document.querySelector('meta[name="description"]')?.content || "Paperless-NGX Dedupe documentation",
    "url": window.location.href,
    "datePublished": document.querySelector('meta[name="date"]')?.content,
    "dateModified": document.querySelector('meta[name="git-revision-date-localized"]')?.content,
    "author": {
      "@type": "Person",
      "name": "Rob Knighton"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Paperless-NGX Dedupe",
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
      "name": "Paperless-NGX Dedupe"
    }
  };

  // Insert structured data
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
  // Add robots meta if not present
  if (!document.querySelector('meta[name="robots"]')) {
    addMetaTag('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
  }

  // Add language meta
  addMetaTag('name', 'language', 'en');

  // Add content type
  addMetaTag('http-equiv', 'Content-Type', 'text/html; charset=utf-8');

  // Add viewport if not present (should be handled by Material theme)
  if (!document.querySelector('meta[name="viewport"]')) {
    addMetaTag('name', 'viewport', 'width=device-width, initial-scale=1');
  }

  // Add keywords based on page content
  const keywords = getPageKeywords();
  if (keywords) {
    addMetaTag('name', 'keywords', keywords);
  }

  // Add article tags for documentation pages
  if (isDocumentationPage()) {
    addMetaTag('name', 'article:tag', 'paperless-ngx');
    addMetaTag('name', 'article:tag', 'deduplication');
    addMetaTag('name', 'article:tag', 'ocr');
    addMetaTag('name', 'article:tag', 'openai');
  }
}

// Add Open Graph tags
function addOpenGraphTags() {
  const title = document.title || 'Paperless-NGX Dedupe';
  const description = document.querySelector('meta[name="description"]')?.content ||
    'Deduplication and AI metadata assistant for paperless-ngx';
  const url = window.location.href;
  const siteName = 'Paperless-NGX Dedupe Documentation';

  addMetaTag('property', 'og:type', 'website');
  addMetaTag('property', 'og:site_name', siteName);
  addMetaTag('property', 'og:title', title);
  addMetaTag('property', 'og:description', description);
  addMetaTag('property', 'og:url', url);
  addMetaTag('property', 'og:locale', 'en_US');
  addMetaTag('property', 'og:image', 'https://m7kni.io/paperless-ngx-dedupe/assets/social-card.png');
  addMetaTag('property', 'og:image:width', '1200');
  addMetaTag('property', 'og:image:height', '630');
  addMetaTag('property', 'og:image:alt', 'Paperless-NGX Dedupe - document deduplication and AI metadata');
}

// Add Twitter Card tags
function addTwitterCardTags() {
  const title = document.title || 'Paperless-NGX Dedupe';
  const description = document.querySelector('meta[name="description"]')?.content ||
    'Deduplication and AI metadata assistant for paperless-ngx';

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
  if (path.includes('/ai-processing/')) return 'AI Processing';
  if (path.includes('/configuration/')) return 'Configuration';
  if (path.includes('/troubleshooting/')) return 'Troubleshooting';
  if (path.includes('/user-guide/')) return 'User Guide';
  if (path.includes('/getting-started/')) return 'Getting Started';
  return 'Documentation';
}

function getPageKeywords() {
  const path = window.location.pathname;
  const title = document.title.toLowerCase();
  const content = document.body.textContent.toLowerCase();

  let keywords = ['paperless', 'paperless-ngx', 'dedupe', 'duplicates', 'ocr'];

  if (path.includes('/ai-processing/')) keywords.push('openai', 'metadata', 'classification', 'tags');
  if (path.includes('/configuration/')) keywords.push('configuration', 'environment variables', 'settings');
  if (path.includes('/troubleshooting/')) keywords.push('troubleshooting', 'debugging', 'errors');
  if (path.includes('/getting-started/')) keywords.push('installation', 'quick start', 'setup');
  if (path.includes('/user-guide/')) keywords.push('workflow', 'ui', 'bulk resolve');

  if (content.includes('minhash')) keywords.push('minhash', 'lsh');
  if (content.includes('fuzzy')) keywords.push('fuzzy matching');
  if (content.includes('redis')) keywords.push('redis');
  if (content.includes('postgres')) keywords.push('postgresql');

  return keywords.join(', ');
}

function isDocumentationPage() {
  return !window.location.pathname.endsWith('/') ||
         window.location.pathname.includes('/docs/');
}
