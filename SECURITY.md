# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Paperless-NGX Deduplication Tool seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do NOT Create a Public Issue

Security vulnerabilities should **never** be reported through public GitHub issues.

### 2. Report Privately

Please report security vulnerabilities by emailing:
- **Email**: 12484127+rknightion@users.noreply.github.com
- **Subject**: [SECURITY] Paperless-NGX Dedupe Vulnerability

Include the following information:
- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment and potential attack scenarios

### 3. Response Timeline

- **Initial Response**: Within 48 hours
- **Vulnerability Assessment**: Within 1 week
- **Patch Development**: Based on severity
  - Critical: Within 48 hours
  - High: Within 1 week
  - Medium: Within 2 weeks
  - Low: Next regular release

### 4. Disclosure Process

1. Security report received and acknowledged
2. Vulnerability confirmed and assessed
3. Fix developed and tested
4. Security advisory prepared
5. Patch released with advisory
6. Public disclosure (after users have time to update)

## Security Best Practices

When deploying Paperless-NGX Deduplication Tool:

### 1. Authentication & Authorization

- **Always** change the default `SECRET_KEY` in production
- Use strong API tokens for paperless-ngx authentication
- Never commit credentials to version control
- Use environment variables or secrets management

### 2. Network Security

- Run behind a reverse proxy (nginx, traefik) with TLS
- Restrict database and Redis ports to local network only
- Use firewall rules to limit access to necessary ports
- Consider VPN access for remote administration

### 3. Container Security

- Regularly update base images
- Run containers as non-root users (already configured)
- Use read-only file systems where possible
- Implement resource limits

### 4. Data Protection

- Encrypt sensitive data at rest
- Use encrypted connections to paperless-ngx
- Regular backups of PostgreSQL database
- Secure backup storage

### 5. Monitoring

- Enable application logs
- Monitor for unusual activity
- Set up alerts for failed authentication attempts
- Regular security audits

## Security Features

The application includes these security features:

- **Non-root containers**: Services run as unprivileged users
- **Health checks**: Automatic detection of service issues
- **Rate limiting**: API rate limiting to prevent abuse
- **Input validation**: Pydantic models for data validation
- **SQL injection protection**: SQLAlchemy ORM with parameterized queries
- **XSS protection**: React's built-in XSS protection
- **CORS configuration**: Restricted cross-origin requests

## Dependency Management

- Automated dependency updates via Dependabot
- Weekly security scanning with Trivy
- SBOM (Software Bill of Materials) generation
- Regular base image updates

## Known Security Considerations

### Paperless-NGX Integration

- This tool requires API access to your paperless-ngx instance
- Ensure paperless-ngx is properly secured
- Use API tokens instead of username/password when possible
- Regularly rotate API tokens

### Redis Cache

- Redis instance should not be exposed to the internet
- Consider Redis AUTH if deploying in shared environments
- Monitor Redis memory usage to prevent DoS

### PostgreSQL Database

- Use strong passwords for database users
- Restrict database access to application only
- Regular backups and test restore procedures
- Enable SSL for remote connections

## Security Checklist for Production

- [ ] Changed default SECRET_KEY
- [ ] Configured TLS/HTTPS
- [ ] Set strong database passwords
- [ ] Restricted network access
- [ ] Enabled logging and monitoring
- [ ] Regular backup schedule
- [ ] Update schedule for dependencies
- [ ] Security scanning in CI/CD
- [ ] Incident response plan

## Contact

For security concerns, contact:
- **Security Email**: 12484127+rknightion@users.noreply.github.com
- **PGP Key**: Available upon request

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who:
- Follow this security policy
- Allow reasonable time for patching
- Avoid privacy violations or data destruction
- Act in good faith

Thank you for helping keep Paperless-NGX Deduplication Tool secure!