import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PolicySection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface TermsSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LoanSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedTermsSections, setExpandedTermsSections] = useState<Set<string>>(new Set());
  const [expandedLoanSections, setExpandedLoanSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const toggleTermsSection = (sectionId: string) => {
    const newExpanded = new Set(expandedTermsSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedTermsSections(newExpanded);
  };

  const toggleLoanSection = (sectionId: string) => {
    const newExpanded = new Set(expandedLoanSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedLoanSections(newExpanded);
  };

  const policySections: PolicySection[] = [
    {
      id: "compliance",
      title: "1. Compliance with Laws",
      content: (
        <div className="space-y-2">
          <p>We operate in compliance with applicable national and international laws and regulations. Customers are responsible for ensuring that their use of our Services complies with local legal requirements, including restrictions on cryptocurrency trading and derivatives.</p>
        </div>
      )
    },
    {
      id: "eligibility",
      title: "2. Eligibility",
      content: (
        <div className="space-y-2">
          <p>To use our Services, you must:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Be at least 18 years old (or the legal age in your jurisdiction).</li>
            <li>Not be restricted by sanctions, regulations, or local law.</li>
            <li>Not be using our Services on behalf of a third party in violation of law.</li>
          </ul>
        </div>
      )
    },
    {
      id: "account-security",
      title: "3. Account Registration & Security",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Provide accurate, complete, and up-to-date information during registration.</li>
            <li>Complete KYC verification as required under AML regulations.</li>
            <li>Maintain the confidentiality of your login credentials.</li>
            <li>Notify us immediately of unauthorized access or suspicious activity.</li>
          </ul>
        </div>
      )
    },
    {
      id: "risk-disclosure",
      title: "4. Risk Disclosure",
      content: (
        <div className="space-y-2">
          <p>Trading cryptocurrencies, perpetual contracts, and leveraged products carries significant risks, including:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>High volatility and potential for substantial losses exceeding your initial investment.</li>
            <li>Platform downtime or technical failures.</li>
            <li>Regulatory changes impacting availability or legality of services.</li>
            <li>Market manipulation or external attacks.</li>
          </ul>
          <p>You trade at your own risk. The Company does not provide financial, legal, or investment advice.</p>
        </div>
      )
    },
    {
      id: "prohibited-activities",
      title: "5. Prohibited Activities",
      content: (
        <div className="space-y-2">
          <p>You may not:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Use Services for unlawful purposes (fraud, money laundering, terrorism financing).</li>
            <li>Engage in market manipulation or wash trading.</li>
            <li>Hack, interfere, or disrupt the platform.</li>
            <li>Use multiple accounts to bypass restrictions.</li>
            <li>Facilitate trades for sanctioned or prohibited entities.</li>
          </ul>
        </div>
      )
    },
    {
      id: "privacy-policy",
      title: "6. Privacy Policy",
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">6.1 Collection & Use of Personal Information</h4>
            <p>We collect personal information to:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Provide and improve our Services.</li>
              <li>Verify accounts, transactions, and compliance (KYC/AML).</li>
              <li>Communicate updates, notices, and marketing.</li>
              <li>Conduct research and analysis.</li>
              <li>Provide technical support.</li>
              <li>Notify changes to Terms or policies.</li>
              <li>Ensure security and fraud prevention.</li>
              <li>Process deposits, withdrawals, and transfers.</li>
              <li>Communicate in emergencies.</li>
              <li>Any other related purposes.</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">6.2 Restrictions on Use</h4>
            <p>We do not use your personal information beyond stated purposes without consent, except where required by law, emergency situations, public health needs, or government obligations.</p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">6.3 Data Security</h4>
            <p>We maintain strict security measures and supervise third-party providers to prevent unauthorized access, disclosure, or tampering.</p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">6.4 Sharing & Disclosure</h4>
            <p>We may share data only in the following cases:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Trusted third-party service providers for processing within scope of use.</li>
              <li>Corporate transactions (merger, acquisition, restructuring).</li>
              <li>Legal obligations or regulatory compliance.</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-2">6.5 User Rights</h4>
            <p>You may request:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Access to your personal data.</li>
              <li>Correction, addition, or deletion.</li>
              <li>Suspension or deletion of data if misuse occurs.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: "cookies",
      title: "7. Cookies & Tracking",
      content: (
        <div className="space-y-2">
          <p>Our Services may use cookies and similar technologies. You can disable cookies in your browser, but some features may be unavailable.</p>
        </div>
      )
    },
    {
      id: "trading-rules",
      title: "8. Trading Rules",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>All transactions are final and binding.</li>
            <li>We may limit, suspend, or reverse transactions in cases of suspicious activity.</li>
            <li>Leverage, margin requirements, and liquidation rules are subject to change.</li>
          </ul>
        </div>
      )
    },
    {
      id: "liability",
      title: "9. Limitation of Liability",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Services are provided "as is" and "as available."</li>
            <li>The Company is not liable for trading losses, market volatility, platform downtime, or unauthorized account access due to user negligence.</li>
            <li>Maximum liability is limited to fees paid by you in the preceding 12 months.</li>
          </ul>
        </div>
      )
    },
    {
      id: "amendments",
      title: "10. Amendments",
      content: (
        <div className="space-y-2">
          <p>We may update these Terms or Privacy Policy at any time. Updates will be posted on our platform, and continued use constitutes acceptance of the revised Terms.</p>
        </div>
      )
    },
    {
      id: "governing-law",
      title: "11. Governing Law & Dispute Resolution",
      content: (
        <div className="space-y-2">
          <p>These Terms are governed by the laws of the United States. Disputes shall be resolved via arbitration at 17 State Street, Suite 300, New York, NY 10004-1501, United States.</p>
        </div>
      )
    }
  ];

  const termsSections: TermsSection[] = [
    {
      id: "introduction",
      title: "1. Introduction",
      content: (
        <div className="space-y-2">
          <p><strong>1.1</strong> These Terms and Conditions (the "Agreement") govern your use of the Becxus platform, a digital currency trading and investment service.</p>
          <p><strong>1.2</strong> By clicking "Agree to Register" and completing registration, you accept and agree to be bound by this Agreement, including all rules, notices, and statements issued by the platform.</p>
          <p><strong>1.3</strong> This Agreement does not govern disputes between users resulting from digital currency transactions.</p>
        </div>
      )
    },
    {
      id: "definitions",
      title: "2. Definitions",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>Digital Currency:</strong> Internationally recognized cryptocurrencies, including Bitcoin (BTC), Ethereum (ETH), and others.</li>
            <li><strong>Platform:</strong> Becxus and Platform Global Digital Assets Co., Ltd.</li>
            <li><strong>User:</strong> A registered member who agrees to these Terms and conducts transactions via the platform.</li>
            <li><strong>User Registration:</strong> The process of providing required information, creating an account, and agreeing to this Agreement.</li>
            <li><strong>Transaction Fees:</strong> Fees charged by the platform for trading digital currencies.</li>
          </ul>
        </div>
      )
    },
    {
      id: "user-registration",
      title: "3. User Registration",
      content: (
        <div className="space-y-2">
          <p><strong>3.1 Eligibility:</strong> Users must have full legal capacity or authorization from a legal guardian.</p>
          <p><strong>3.2 Purpose:</strong> Users agree not to use the platform for illegal activities or to disrupt trading order.</p>
          <p><strong>3.3 Process:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Provide accurate and complete personal information.</li>
            <li>Set a secure password and account credentials.</li>
            <li>After registration, users may trade digital currencies and receive platform communications via email or SMS.</li>
          </ul>
        </div>
      )
    },
    {
      id: "services",
      title: "4. Services",
      content: (
        <div className="space-y-2">
          <p><strong>4.1 The platform provides:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Real-time digital currency market data.</li>
            <li>Order submission and execution.</li>
            <li>Account management tools.</li>
            <li>Participation in platform-organized activities and promotions.</li>
          </ul>
          <p><strong>4.2 Users must:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Comply with all applicable laws and platform rules.</li>
            <li>Safeguard their account credentials.</li>
            <li>Notify the platform immediately of unauthorized account access.</li>
            <li>Avoid transferring accounts or credentials without platform consent.</li>
          </ul>
        </div>
      )
    },
    {
      id: "trading-rules",
      title: "5. Trading Rules",
      content: (
        <div className="space-y-2">
          <p><strong>5.1</strong> Users must review all transaction information before placing orders.</p>
          <p><strong>5.2</strong> Submitting an order authorizes the platform to match transactions automatically.</p>
          <p><strong>5.3</strong> Users can view transaction history and revoke or modify unexecuted orders.</p>
        </div>
      )
    },
    {
      id: "user-rights-obligations",
      title: "6. User Rights and Obligations",
      content: (
        <div className="space-y-2">
          <p><strong>Rights:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Right to access platform services.</li>
            <li>Right to withdraw funds, subject to applicable fees.</li>
          </ul>
          <p><strong>Obligations:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Obligation to provide accurate personal information.</li>
            <li>Obligation not to interfere with trading or platform operations.</li>
            <li>Obligation not to make false claims against the platform.</li>
          </ul>
        </div>
      )
    },
    {
      id: "platform-rights-obligations",
      title: "7. Platform Rights and Obligations",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Verify and correct user information.</li>
            <li>Suspend or terminate accounts violating this Agreement.</li>
            <li>Modify or discontinue services at its discretion.</li>
            <li>Ensure a secure trading environment and custody of funds.</li>
            <li>Retain records of user activity while respecting privacy laws.</li>
          </ul>
        </div>
      )
    },
    {
      id: "risk-disclosure",
      title: "8. Risk Disclosure",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Cryptocurrency trading is highly volatile and carries significant risk.</li>
            <li>Users must independently assess investment value and risk.</li>
            <li>Losses due to regulatory changes, market volatility, or force majeure are the responsibility of the user.</li>
          </ul>
        </div>
      )
    },
    {
      id: "privacy-data-protection",
      title: "9. Privacy and Data Protection",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>User data will not be sold or shared without consent, except as required by law.</li>
            <li>Platform collects registration, transaction, and usage data to provide services.</li>
            <li>Users agree to the platform's handling of personal information under these Terms.</li>
          </ul>
        </div>
      )
    },
    {
      id: "aml",
      title: "10. Anti-Money Laundering (AML)",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Platform complies with international AML regulations.</li>
            <li>Users must provide valid identity documents for verification.</li>
            <li>Platform reports large or suspicious transactions to regulatory authorities.</li>
          </ul>
        </div>
      )
    },
    {
      id: "intellectual-property",
      title: "11. Intellectual Property",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>All platform content, software, and trademarks are the property of the platform.</li>
            <li>Users may not copy, distribute, or use intellectual property for commercial purposes.</li>
            <li>Users transfer rights to content they post to the platform.</li>
          </ul>
        </div>
      )
    },
    {
      id: "liability",
      title: "12. Liability",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Platform is not liable for losses due to market fluctuations, system failures, or force majeure.</li>
            <li>Users are responsible for losses caused by false or incomplete registration information.</li>
            <li>Platform may terminate accounts violating this Agreement or engaging in illegal activities.</li>
          </ul>
        </div>
      )
    },
    {
      id: "dispute-resolution",
      title: "13. Dispute Resolution",
      content: (
        <div className="space-y-2">
          <p>Disputes should be resolved through friendly negotiation. The governing law and jurisdiction will be specified by the platform in accordance with applicable regulations.</p>
        </div>
      )
    },
    {
      id: "amendments-termination",
      title: "14. Amendments and Termination",
      content: (
        <div className="space-y-2">
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Platform may update these Terms at any time; continued use constitutes acceptance.</li>
            <li>Users may terminate accounts at any time.</li>
            <li>Termination does not absolve users from obligations incurred prior to termination.</li>
          </ul>
        </div>
      )
    },
    {
      id: "customer-support",
      title: "15. Customer Support",
      content: (
        <div className="space-y-2">
          <p>Professional support is available for inquiries, troubleshooting, and complaints. Contact details and response procedures are provided on the platform.</p>
        </div>
      )
    }
  ];

  const loanSections: LoanSection[] = [
    {
      id: "loan-facility",
      title: "1. Loan Facility",
      content: (
        <div className="space-y-2">
          <p><strong>1.1</strong> The Borrower agrees to receive a loan denominated in USDT against the collateral of crypto holdings in the user's account.</p>
          <p><strong>1.2</strong> The loan amount approved shall be based on the Borrower's financial standing, funds in the account, and credit score.</p>
          <p><strong>1.3</strong> The minimum loan tenure shall be 7 days, and the maximum shall be 90 days, can get extension according to the account history statement.</p>
        </div>
      )
    },
    {
      id: "interest-rate",
      title: "2. Interest Rate",
      content: (
        <div className="space-y-2">
          <p><strong>2.1</strong> The loan shall accrue interest at a fixed rate of 5.75%, with the total repayment to be made in full within the agreed loan tenure.</p>
          <p><strong>2.2</strong> If the Borrower maintains a positive credit history, a strong credit score, and actively participates in all portions of the website, the Lender may, at its discretion, offer an interest-free loan.</p>
          <p><strong>2.3</strong> Interest shall be included in the total repayment amount due from the Borrower, to be paid in full within the specified loan tenure. An extension of the loan tenure may be granted at the Lender's discretion, depending on the Borrower's account history and credit score.</p>
        </div>
      )
    },
    {
      id: "repayment-terms",
      title: "3. Repayment Terms",
      content: (
        <div className="space-y-2">
          <p><strong>3.1</strong> Repayments shall be made in full and shall include both principal and interest.</p>
          <p><strong>3.2</strong> Failure to pay the loan within a specified time shall result in an additional 5% penalty on daily basis on the total outstanding loan balance.</p>
          <p><strong>3.3</strong> If principal is paid on time but the interest is not, the Borrower may request a tenure extension, subject to approval by the Lender.</p>
        </div>
      )
    },
    {
      id: "collateral-asset-usage",
      title: "4. Collateral and Asset Usage",
      content: (
        <div className="space-y-2">
          <p><strong>4.1</strong> The Borrower agrees to pledge crypto assets as collateral, which will be securely held by the Lender or an authorized custodian.</p>
          <p><strong>4.2</strong> After loan disbursement, the Borrower may use the collateral value and available loan balance for trading only on approved platforms.</p>
          <p><strong>4.3</strong> Until the loan is fully repaid (principal + interest), all collateral, loan amounts, and generated profits shall remain frozen and inaccessible.</p>
          <p><strong>4.4</strong> Upon full settlement of all dues, the freeze shall be lifted immediately, and full access will be reinstated.</p>
        </div>
      )
    },
    {
      id: "disbursement-payments",
      title: "5. Disbursement and Payments",
      content: (
        <div className="space-y-2">
          <p><strong>5.1</strong> All disbursements and repayments shall be conducted exclusively via authorized third-party payment processors or platforms designated by the Lender.</p>
          <p><strong>5.2</strong> Borrowers are responsible for ensuring timely payment confirmations and tracking their repayment schedule.</p>
        </div>
      )
    },
    {
      id: "default-recovery",
      title: "6. Default and Recovery",
      content: (
        <div className="space-y-2">
          <p><strong>6.1</strong> Any breach of repayment obligation constitutes a default.</p>
          <p><strong>6.2</strong> In the event of a default, the Lender reserves the right to liquidate part or all of the collateral without prior notice to cover outstanding amounts.</p>
          <p><strong>6.3</strong> Continued non-compliance may result in further legal action, asset recovery measures, and reporting to relevant authorities.</p>
        </div>
      )
    },
    {
      id: "risk-disclosure",
      title: "7. Risk Disclosure",
      content: (
        <div className="space-y-2">
          <p><strong>7.1</strong> The Borrower acknowledges that cryptocurrencies are inherently volatile and subject to market risk.</p>
          <p><strong>7.2</strong> The Lender shall not be liable for any trading losses or value depreciation during the loan period.</p>
          <p><strong>7.3</strong> All trades and decisions made using the loan balance or collateral are the Borrower's sole responsibility.</p>
        </div>
      )
    },
    {
      id: "governing-law-jurisdiction",
      title: "8. Governing Law and Jurisdiction",
      content: (
        <div className="space-y-2">
          <p><strong>8.1</strong> This Agreement shall be governed by and interpreted in accordance with the laws of the United States.</p>
          <p><strong>8.2</strong> Any disputes arising under or in connection with this Agreement shall be subject to the exclusive jurisdiction of the courts of Securities and Exchange Commission, Commodity Futures Trading Commission, Financial Crimes Enforcement Network and Internal Revenue Service.</p>
        </div>
      )
    },
    {
      id: "customer-service",
      title: "9. Customer Service",
      content: (
        <div className="space-y-2">
          <p>If you have any questions or need further clarification regarding any part of this agreement, please feel free to reach out to our Customer Service team. We are always happy to assist you and ensure you fully understand all terms before proceeding.</p>
        </div>
      )
    },
    {
      id: "acknowledgment-consent",
      title: "10. Acknowledgment and Consent",
      content: (
        <div className="space-y-2">
          <p>By checking this Agreement, the Borrower agrees to all terms, conditions, risks, and obligations outlined herein and confirms that they do so voluntarily and with full understanding.</p>
        </div>
      )
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm sm:max-w-md md:max-w-4xl max-h-[95vh] overflow-y-auto bg-[#111111] border border-[#1e1e1e] text-gray-100 rounded-2xl shadow-2xl" hideCloseButton>
        <DialogHeader className="p-4 md:p-6 border-b border-[#1e1e1e]">
          <DialogTitle className="text-base md:text-xl font-bold text-center text-white">
            Becxus Legal Agreements
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="privacy" className="w-full p-4 md:p-6 space-y-4">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1 bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl">
            <TabsTrigger value="privacy" className="text-xs md:text-sm py-3 px-1 md:px-2 text-center leading-tight text-gray-300 data-[state=active]:bg-[#1f2933] data-[state=active]:text-white rounded-lg transition-colors duration-200">
              <div className="flex flex-col">
                <span>Privacy</span>
                <span>Policy</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="terms" className="text-xs md:text-sm py-3 px-1 md:px-2 text-center leading-tight text-gray-300 data-[state=active]:bg-[#1f2933] data-[state=active]:text-white rounded-lg transition-colors duration-200">
              <div className="flex flex-col">
                <span>Terms &</span>
                <span>Conditions</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="loan" className="text-xs md:text-sm py-3 px-1 md:px-2 text-center leading-tight text-gray-300 data-[state=active]:bg-[#1f2933] data-[state=active]:text-white rounded-lg transition-colors duration-200">
              <div className="flex flex-col">
                <span>Loan</span>
                <span>Agreement</span>
              </div>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="privacy" className="space-y-4">
            <div className="text-center text-sm text-gray-400 mb-6">
              <p>Welcome to Becxus ("the Company," "we," "our," or "us"). This Privacy Policy governs your access and use of our cryptocurrency trading platform, mobile applications, and related services ("Services").</p>
              <p className="mt-2">For clarity and ease of navigation, this page is organized into sections. Click a section to expand and read more.</p>
            </div>

            {policySections.map((section) => (
              <div key={section.id} className="border border-[#1e1e1e] rounded-xl bg-[#0a0a0a] overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[#151515] transition-colors duration-200"
                >
                  <span className="font-semibold text-gray-100">{section.title}</span>
                  {expandedSections.has(section.id) ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                {expandedSections.has(section.id) && (
                  <div className="px-4 pb-4 text-sm text-gray-300 leading-relaxed">
                    {section.content}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
          
          <TabsContent value="terms" className="space-y-4">
            <div className="text-center text-sm text-gray-400 mb-6">
              <p>These Terms and Conditions (the "Agreement") govern your use of the Becxus platform, a digital currency trading and investment service.</p>
              <p className="mt-2">For clarity and ease of navigation, this page is organized into sections. Click a section to expand and read more.</p>
            </div>

            {termsSections.map((section) => (
              <div key={section.id} className="border border-[#1e1e1e] rounded-xl bg-[#0a0a0a] overflow-hidden">
                <button
                  onClick={() => toggleTermsSection(section.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[#151515] transition-colors duration-200"
                >
                  <span className="font-semibold text-gray-100">{section.title}</span>
                  {expandedTermsSections.has(section.id) ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                {expandedTermsSections.has(section.id) && (
                  <div className="px-4 pb-4 text-sm text-gray-300 leading-relaxed">
                    {section.content}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
          
          <TabsContent value="loan" className="space-y-4">
            <div className="text-center text-sm text-gray-400 mb-6">
              <p><strong>Crypto Backed Loan Agreement</strong></p>
              <p>This Crypto-Backed Loan Agreement ("Agreement")</p>
              <p><strong>Lender:</strong> Becxus</p>
              <p>This Agreement is governed by applicable U.S. federal and regional laws. The Borrower acknowledges that the Lender complies with all relevant regulation under the Bank Secrecy Act and consumer lending laws.</p>
              <p className="mt-2">For clarity and ease of navigation, this page is organized into sections. Click a section to expand and read more.</p>
            </div>

            {loanSections.map((section) => (
              <div key={section.id} className="border border-[#1e1e1e] rounded-xl bg-[#0a0a0a] overflow-hidden">
                <button
                  onClick={() => toggleLoanSection(section.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-[#151515] transition-colors duration-200"
                >
                  <span className="font-semibold text-gray-100">{section.title}</span>
                  {expandedLoanSections.has(section.id) ? (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                {expandedLoanSections.has(section.id) && (
                  <div className="px-4 pb-4 text-sm text-gray-300 leading-relaxed">
                    {section.content}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4 px-4 md:px-6 pb-4 md:pb-6 border-t border-[#1e1e1e]">
          <Button onClick={onClose} variant="outline" className="bg-transparent border-[#2a2a2a] text-gray-200 hover:bg-[#1a1a1a] hover:text-white transition-colors duration-200">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
