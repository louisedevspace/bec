import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="gradient-bg px-6 py-12 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="w-20 h-20 bg-[#111] border border-[#2a2a2a] rounded-xl mx-auto mb-6 flex items-center justify-center overflow-hidden">
              <Logo className="w-full h-full" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 text-foreground">
              ABOUT US
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto">
              Global. Secure. Transparent. The future of cryptocurrency contract trading
            </p>
          </div>
          <Button 
            size="lg" 
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4"
            onClick={handleStartTrading}
          >
            START TRADING
          </Button>
        </div>
      </section>

      <div className="px-6 py-8 max-w-6xl mx-auto space-y-8">
        {/* Company Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Our Global Presence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="text-foreground">
                  Headquartered in the <strong>17 State Street, Suite 300, New York, NY 10004-1501</strong> United States with 
                  operational centers in <strong>South Korea, Italy, and Hong Kong</strong>, our cryptocurrency perpetual contract 
                  exchange serves traders across the globe. With a vast international reach, we provide seamless access 
                  to digital asset trading markets anytime, anywhere.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Expertise */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Our Expert Team
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">
              Our platform is powered by a professional and highly experienced team of blockchain specialists, 
              technology experts, and financial strategists. With decades of combined expertise in internet 
              development, blockchain innovation, and global operations, we are united by a single vision: to 
              deliver a safe, efficient, and transparent environment where traders can thrive.
            </p>
          </CardContent>
        </Card>

        {/* Trading Platform */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Advanced Trading Platform
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-foreground">
              We provide contract trading built on internationally recognized cryptocurrency indexes, including 
              <strong> PANDA, BTC, ETH, BCH, LTC, ETC, EOS</strong>, and other mainstream digital assets. With 
              <strong> 24/7 uninterrupted access</strong>, ultra-low margin requirements, and convenient two-way 
              contract options, we make trading simpler, faster, and more flexible.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>24/7 Trading Available</span>
            </div>
          </CardContent>
        </Card>

        {/* Fair Trading Mechanism */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Transparent & Fair Trading
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">
              By eliminating internal market indexes and adopting a fair OTC mechanism, we ensure that every 
              transaction reflects true global market data. This approach creates a marketplace that is open, 
              fair, and transparent empowering traders to make informed decisions with confidence.
            </p>
          </CardContent>
        </Card>

        {/* Mission Statement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Our Mission
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">
              Our mission is to redefine digital asset trading by providing a secure, transparent, and globally 
              accessible platform for cryptocurrency contract trading. Through cutting-edge technology, low-cost 
              structures, and professional expertise, we are committed to ensuring fair markets, continuous access, 
              and seamless trading experiences for users worldwide.
            </p>
          </CardContent>
        </Card>

        {/* Vision Statement */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Our Vision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground">
              We envision becoming the world's most trusted and innovative cryptocurrency contract trading 
              platform where technology, transparency, and opportunity converge to create a borderless financial 
              ecosystem for every trader.
            </p>
          </CardContent>
        </Card>

        {/* Key Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6 text-center">
              <Globe className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Global Reach</h3>
              <p className="text-sm text-muted-foreground">
                Serving traders worldwide with operational centers across multiple continents
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">Secure Platform</h3>
              <p className="text-sm text-muted-foreground">
                Advanced security measures and professional expertise ensure safe trading
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <Zap className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h3 className="font-semibold mb-2">24/7 Access</h3>
              <p className="text-sm text-muted-foreground">
                Uninterrupted trading with ultra-low margins and flexible contract options
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Call to Action */}
        <Card className="text-center">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold mb-4">Ready to Start Trading?</h2>
            <p className="text-muted-foreground mb-6">
              Join thousands of traders worldwide and experience the future of cryptocurrency trading
            </p>
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4"
              onClick={handleStartTrading}
            >
              GET STARTED NOW
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
