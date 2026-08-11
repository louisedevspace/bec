import { Button } from "@/components/ui/button";
import {
  Globe,
  Shield,
  Eye,
  Target,
  Lightbulb,
  Users,
  Building2,
  MapPin,
  Clock,
  TrendingUp,
  Zap
} from "lucide-react";
import { useLocation } from "wouter";
import { Logo } from "@/components/brand/logo";

export default function AboutPage() {
  const [, setLocation] = useLocation();

  const handleStartTrading = () => {
    setLocation('/futures');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-16 text-center border-b border-border">
        <div className="relative max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="w-20 h-20 bg-card border border-border rounded-xl mx-auto mb-6 flex items-center justify-center overflow-hidden">
              <Logo className="w-full h-full" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 text-foreground">
              About Us
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto">
              Global. Secure. Transparent. The future of cryptocurrency contract trading
            </p>
          </div>
          <Button
            size="lg"
            className="h-12 rounded-xl font-semibold px-8"
            onClick={handleStartTrading}
          >
            Start Trading
          </Button>
        </div>
      </section>

      <div className="px-6 py-8 max-w-6xl mx-auto space-y-4">
        {/* Company Overview */}
        <SectionCard icon={Building2} title="Our Global Presence">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Headquartered in the <strong className="text-foreground">17 State Street, Suite 300, New York, NY 10004-1501</strong> United States with
              operational centers in <strong className="text-foreground">South Korea, Italy, and Hong Kong</strong>, our cryptocurrency perpetual contract
              exchange serves traders across the globe. With a vast international reach, we provide seamless access
              to digital asset trading markets anytime, anywhere.
            </p>
          </div>
        </SectionCard>

        {/* Team Expertise */}
        <SectionCard icon={Users} title="Our Expert Team">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our platform is powered by a professional and highly experienced team of blockchain specialists,
            technology experts, and financial strategists. With decades of combined expertise in internet
            development, blockchain innovation, and global operations, we are united by a single vision: to
            deliver a safe, efficient, and transparent environment where traders can thrive.
          </p>
        </SectionCard>

        {/* Trading Platform */}
        <SectionCard icon={TrendingUp} title="Advanced Trading Platform">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              We provide contract trading built on internationally recognized cryptocurrency indexes, including
              <strong className="text-foreground"> PANDA, BTC, ETH, BCH, LTC, ETC, EOS</strong>, and other mainstream digital assets. With
              <strong className="text-foreground"> 24/7 uninterrupted access</strong>, ultra-low margin requirements, and convenient two-way
              contract options, we make trading simpler, faster, and more flexible.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>24/7 Trading Available</span>
            </div>
          </div>
        </SectionCard>

        {/* Fair Trading Mechanism */}
        <SectionCard icon={Eye} title="Transparent & Fair Trading">
          <p className="text-sm text-muted-foreground leading-relaxed">
            By eliminating internal market indexes and adopting a fair OTC mechanism, we ensure that every
            transaction reflects true global market data. This approach creates a marketplace that is open,
            fair, and transparent empowering traders to make informed decisions with confidence.
          </p>
        </SectionCard>

        {/* Mission Statement */}
        <SectionCard icon={Target} title="Our Mission">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our mission is to redefine digital asset trading by providing a secure, transparent, and globally
            accessible platform for cryptocurrency contract trading. Through cutting-edge technology, low-cost
            structures, and professional expertise, we are committed to ensuring fair markets, continuous access,
            and seamless trading experiences for users worldwide.
          </p>
        </SectionCard>

        {/* Vision Statement */}
        <SectionCard icon={Lightbulb} title="Our Vision">
          <p className="text-sm text-muted-foreground leading-relaxed">
            We envision becoming the world's most trusted and innovative cryptocurrency contract trading
            platform where technology, transparency, and opportunity converge to create a borderless financial
            ecosystem for every trader.
          </p>
        </SectionCard>

        {/* Key Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard icon={Globe} title="Global Reach" description="Serving traders worldwide with operational centers across multiple continents" />
          <FeatureCard icon={Shield} title="Secure Platform" description="Advanced security measures and professional expertise ensure safe trading" />
          <FeatureCard icon={Zap} title="24/7 Access" description="Uninterrupted trading with ultra-low margins and flexible contract options" />
        </div>

        {/* Call to Action */}
        <div className="bg-card border border-border rounded-xl text-center p-8">
          <h2 className="text-xl font-bold text-foreground mb-3">Ready to Start Trading?</h2>
          <p className="text-muted-foreground mb-6">
            Join thousands of traders worldwide and experience the future of cryptocurrency trading
          </p>
          <Button
            size="lg"
            className="h-12 rounded-xl font-semibold px-8"
            onClick={handleStartTrading}
          >
            Get Started Now
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SectionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}

function SectionCard({ icon: Icon, title, children }: SectionCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {title}
        </h2>
      </div>
      <div className="p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 text-center">
      <div className="w-14 h-14 bg-primary/10 rounded-xl mx-auto mb-4 flex items-center justify-center">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
