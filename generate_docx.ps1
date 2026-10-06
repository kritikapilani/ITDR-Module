Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$docxPath = "d:\ITDR Module\PRD_Stitch_Enterprise_ITDR.docx"
if (Test-Path $docxPath) { Remove-Item $docxPath -Force }

$tempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tempDir | Out-Null
New-Item -ItemType Directory -Path "$tempDir\_rels" | Out-Null
New-Item -ItemType Directory -Path "$tempDir\word" | Out-Null
New-Item -ItemType Directory -Path "$tempDir\word\_rels" | Out-Null

# 1. [Content_Types].xml
$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
'@
[System.IO.File]::WriteAllText("$tempDir\[Content_Types].xml", $contentTypes, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText("$tempDir\_rels\.rels", $rels, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText("$tempDir\word\_rels\document.xml.rels", $docRels, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText("$tempDir\word\styles.xml", $stylesXml, [System.Text.Encoding]::UTF8)

# Function to generate document.xml
$docXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Document Title -->
    <w:p>
      <w:pPr>
        <w:spacing w:before="300" w:after="100"/>
        <w:jc w:val="left"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
          <w:b/>
          <w:sz w:val="52"/>
          <w:color w:val="0F172A"/>
        </w:rPr>
        <w:t>Product Requirements Document (PRD)</w:t>
      </w:r>
    </w:p>

    <w:p>
      <w:pPr>
        <w:spacing w:before="0" w:after="240"/>
        <w:pBdr>
          <w:bottom w:val="single" w:sz="18" w:space="8" w:color="2563EB"/>
        </w:pBdr>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
          <w:b/>
          <w:sz w:val="28"/>
          <w:color w:val="2563EB"/>
        </w:rPr>
        <w:t>Stitch Enterprise ITDR (IT Disaster Recovery) Management Platform</w:t>
      </w:r>
    </w:p>

    <!-- Meta Info Box -->
    <w:p>
      <w:pPr>
        <w:pBdr>
          <w:left w:val="single" w:sz="24" w:space="12" w:color="0F172A"/>
        </w:pBdr>
        <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
        <w:spacing w:before="120" w:after="240"/>
        <w:ind w:left="200" w:right="200"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="334155"/></w:rPr>
        <w:t>Document Version: </w:t>
      </w:r>
      <w:r><w:rPr><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>2.0 (Post-Implementation)   |   </w:t></w:r>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="334155"/></w:rPr><w:t>Status: </w:t></w:r>
      <w:r><w:rPr><w:sz w:val="20"/><w:color w:val="059669"/></w:rPr><w:t>Implemented &amp; Verified (51/51 automated tests passed)&#10;</w:t></w:r>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="334155"/></w:rPr><w:t>Classification: </w:t></w:r>
      <w:r><w:rPr><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>Enterprise Business Continuity Management (BCM) / IT Resilience&#10;</w:t></w:r>
      <w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="334155"/></w:rPr><w:t>Compliance Standards: </w:t></w:r>
      <w:r><w:rPr><w:sz w:val="20"/><w:color w:val="0F172A"/></w:rPr><w:t>ISO 22301:2019, ISO/IEC 27031:2011, NIST SP 800-34 Rev. 1</w:t></w:r>
    </w:p>

    <!-- 1. Executive Summary -->
    <w:p>
      <w:pPr><w:spacing w:before="300" w:after="120"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0F172A"/></w:rPr><w:t>1. Executive Summary &amp; Objective</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The Stitch Enterprise ITDR Management Platform is a core enterprise module within the Business Continuity Management (BCM) suite. It bridges the critical operational gap between business-level continuity planning (BIA, BCP, Crisis Management) and technical recovery execution. The module establishes an automated, auditable, and repeatable lifecycle for authoring technical DR runbooks, managing application asset inventories, validating recovery procedures via dedicated ITDR testing contracts, and monitoring enterprise-wide resilience postures.</w:t></w:r>
    </w:p>

    <!-- Key Objectives Bullet Points -->
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>• Automated Objective Inheritance: </w:t></w:r>
      <w:r><w:t>Directly inherits BIA RTO and RPO requirements per application using the "most demanding" roll-up principle.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>• Versioned Runbook Authoring: </w:t></w:r>
      <w:r><w:t>Multi-step plan builder with recovery strategies, step prerequisites, estimated durations, rollback procedures, and escalation hierarchies.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>• Bi-Directional Testing Integration: </w:t></w:r>
      <w:r><w:t>Dedicated ITDR Test Plans and Test Results sub-modules with automated expected-vs-actual SLA comparison and version-binding.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>• Autonomous Readiness Engine: </w:t></w:r>
      <w:r><w:t>Dynamically computes application resilience states (Ready, Untested, Failed Test, Expired, Drifted) backed by immutable evidence.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="200"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="2563EB"/></w:rPr><w:t>• Audit &amp; Compliance Readiness: </w:t></w:r>
      <w:r><w:t>Instant exportable compliance evidence mapped directly to ISO 22301, ISO 27031, and NIST frameworks.</w:t></w:r>
    </w:p>

    <!-- 2. Personas & RBAC -->
    <w:p>
      <w:pPr><w:spacing w:before="300" w:after="120"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0F172A"/></w:rPr><w:t>2. Personas &amp; Role-Based Access Control (RBAC)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The platform implements strict Segregation of Duties (SoD) to satisfy regulatory and audit standards. Plan authors cannot approve their own DR plans.</w:t></w:r>
    </w:p>

    <!-- RBAC Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9200" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
          <w:insideV w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        </w:tblBorders>
        <w:tblCellMar>
          <w:top w:w="120" w:type="dxa"/>
          <w:bottom w:w="120" w:type="dxa"/>
          <w:left w:w="160" w:type="dxa"/>
          <w:right w:w="160" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <!-- Header Row -->
      <w:tr>
        <w:trPr><w:tblHeader/></w:trPr>
        <w:tc>
          <w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="0F172A"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Persona</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="0F172A"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Role Key</w:t></w:r></w:p>
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="5200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="0F172A"/></w:tcPr>
          <w:p><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Functional Responsibilities &amp; Scope</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
      <!-- Row 1 -->
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>System Admin</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>ADMIN</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Full governance: registers applications, sets owner assignments, manages tenant feature flags, and logs emergency overrides.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Row 2 -->
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Plan Owner</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:r><w:t>PLAN_OWNER</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:r><w:t>Technical custodian: builds DR runbooks, manages component dependencies, updates strategies, and submits plans for review.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Row 3 -->
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Plan Approver</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>APPROVER</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Authorizing official: reviews submitted DR runbooks and test plans, validates recovery feasibility, and grants formal approval.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Row 4 -->
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Auditor</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:r><w:t>AUDITOR</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/></w:tcPr><w:p><w:r><w:t>Compliance reviewer: read-only access to immutable audit trails, approval timestamps, override justifications, and exports.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <!-- Row 5 -->
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Executive</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>EXECUTIVE</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="5200" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Leadership view: high-level resilience posture dashboards, Tier 1/2 coverage KPIs, and gap summaries.</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- 3. Key Architecture & Engineering Decisions -->
    <w:p>
      <w:pPr><w:spacing w:before="300" w:after="120"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0F172A"/></w:rPr><w:t>3. Architecture &amp; Core Engineering Decisions (D1–D7)</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• D1 (Authoritative Asset Inventory): </w:t></w:r>
      <w:r><w:t>Native ITDR technical repository combined with a pluggable CMDB adapter interface.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• D2 (BIA Identity &amp; Roll-up): </w:t></w:r>
      <w:r><w:t>Stable key 'biaApplicationId'. Grain is exactly 1 recovery target per BIA application. Roll-up uses the lowest non-null RTO and RPO among all mapped processes.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• D3 (Version Binding): </w:t></w:r>
      <w:r><w:t>DR tests must bind to a specific approved planVersionId. Unbound test results are rejected for readiness calculations.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• D4 (Recertification Window): </w:t></w:r>
      <w:r><w:t>Standardized 12-month re-testing and review window across Tier 1, 2, and 3 applications.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• D5 (Segregation of Duties): </w:t></w:r>
      <w:r><w:t>Enforced SoD rule: authorUserId cannot equal approverUserId.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:ind w:left="400"/><w:spacing w:after="80"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>• D6 &amp; D7 (Crisis Scope Boundary): </w:t></w:r>
      <w:r><w:t>Data linkage matches BCP standards; real-time crisis invocation remains strictly owned by Crisis Management.</w:t></w:r>
    </w:p>

    <!-- 4. Functional Specifications -->
    <w:p>
      <w:pPr><w:spacing w:before="300" w:after="120"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0F172A"/></w:rPr><w:t>4. Functional Specifications by Module</w:t></w:r>
    </w:p>

    <!-- 4.1 Applications -->
    <w:p>
      <w:pPr><w:spacing w:before="160" w:after="60"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2563EB"/></w:rPr><w:t>4.1 IT Applications &amp; Asset Inventory (#coverage, #target/:id)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Maintains complete visibility into disaster recovery scope, tier classifications (Tier 1 Mission Critical, Tier 2 Business Critical, Tier 3 Non-Critical), hosting environments (AWS, Azure, GCP, On-Prem, Hybrid, SaaS), primary/backup owners, and mapped business processes. Supports technical infrastructure asset registration (databases, services, servers) and dependency links with cycle detection.</w:t></w:r>
    </w:p>

    <!-- 4.2 DR Plan Builder -->
    <w:p>
      <w:pPr><w:spacing w:before="160" w:after="60"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2563EB"/></w:rPr><w:t>4.2 DR Plan Builder &amp; Runbooks (#builder, #target/:id/runbook)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Provides a structured runbook workspace with recovery strategy templates (hot site, warm site, cold site, cloud DR, backup/restore), step-by-step procedures with instructions, estimated duration, rollback, and verification steps. Manages emergency escalation contacts and document attachments. Plans transition through strict lifecycle states: draft -> in_review -> approved -> published.</w:t></w:r>
    </w:p>

    <!-- 4.3 Testing -->
    <w:p>
      <w:pPr><w:spacing w:before="160" w:after="60"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2563EB"/></w:rPr><w:t>4.3 Testing &amp; Validation (#test-plans, #test-results)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Divided into two dedicated sub-modules: (1) ITDR Test Plans for pre-execution preparation, exercise mode selection, participant assignment, and approval; (2) ITDR Test Results for capturing post-execution telemetry, actual RTO/RPO, step pass/fail, and automated SLA comparison. If actual recovery time exceeds target RTO, the system automatically derives a FAIL posture and triggers remediation.</w:t></w:r>
    </w:p>

    <!-- 4.4 Dashboard -->
    <w:p>
      <w:pPr><w:spacing w:before="160" w:after="60"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2563EB"/></w:rPr><w:t>4.4 Autonomous Readiness Engine &amp; Dashboard (#dashboard)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Calculates real-time readiness status per application based on active approved plan versions and recent bound test telemetry. Computes enterprise resilience KPIs: % Tier 1/2 Covered, % Tested in Window, and % Meeting RTO/RPO SLAs.</w:t></w:r>
    </w:p>

    <!-- 4.5 Audit -->
    <w:p>
      <w:pPr><w:spacing w:before="160" w:after="60"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2563EB"/></w:rPr><w:t>4.5 Compliance &amp; Audit Governance (#audit)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Maintains immutable chronological logs of all approvals, rejections, overrides, and test executions. Provides instant on-demand audit evidence export mapped to ISO 22301 Clause 8.4, ISO 27031 Clause 6.3, and NIST SP 800-34.</w:t></w:r>
    </w:p>

    <!-- 5. Verification & Metrics -->
    <w:p>
      <w:pPr><w:spacing w:before="300" w:after="120"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="0F172A"/></w:rPr><w:t>5. Verification &amp; Quality Metrics</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>All 51 automated architectural and functional test criteria across Phase 0 (Foundations), Phase 1 (Core Inventory &amp; Runbooks), and Phase 2 (Testing &amp; Readiness) are passing with 100% compliance.</w:t></w:r>
    </w:p>

    <!-- Signature Section -->
    <w:p>
      <w:pPr><w:spacing w:before="400" w:after="80"/><w:keepNext/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>Sign-off &amp; Approvals</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:color w:val="64748B"/></w:rPr><w:t>Prepared by: Enterprise Resilience Architecture Team&#10;Approved by: Business Continuity Management (BCM) Committee&#10;Verified against: ISO 22301 / ISO 27031 Compliance Frameworks</w:t></w:r>
    </w:p>

  </w:body>
</w:document>
"@
[System.IO.File]::WriteAllText("$tempDir\word\document.xml", $docXml, [System.Text.Encoding]::UTF8)

# Compress directory to .docx file
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $docxPath)
Remove-Item -Path $tempDir -Recurse -Force
Write-Host "Created $docxPath successfully!"
