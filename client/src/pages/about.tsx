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
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 py-16 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="w-20 h-20 bg-[#111] border border-[#2a2a2a] rounded-xl mx-auto mb-6 flex items-center justify-center overflow-hidden">
              <Logo className="w-full h-full" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 text-white">
              ABOUT US
            </h1>
            <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
              Global. Secure. Transparent. The future of cryptocurrency contract trading
            </p>
          </div>
          <Button 
            size="lg" 
            className="h-12 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 px-8 transition-all duration-150 hover:translate-y-[1px]"
            onClick={handleStartTrading}
          >
            START TRADING
          </Button>
        </div>
      </section>

      <div className="px-6 py-8 max-w-6xl mx-auto space-y-5">
        {/* Company Overview */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-[#1e1e1e]">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-white">
              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Building2 className="h-4 w-4 text-blue-400" />
              </div>
              Our Global Presence
            </h2>
          </div>
          <div className="p-4 md:p-6">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-blue-400 mt-1 flex-shrink-0" />
              <p className="text-sm text-gray-300 leading-relaxed">
                Headquartered in the <strong className="text-white">17 State Street, Suite 300, New York, NY 10004-1501</strong> United States with 
                operational centers in <strong className="text-white">South Korea, Italy, and Hong Kong</strong>, our cryptocurrency perpetual contract 
                exchange serves traders across the globe. With a vast international reach, we provide seamless access 
                to digital asset trading markets anytime, anywhere.
              </p>
            </div>
          </div>
        </div>

        {/* Team Expertise */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-[#1e1e1e]">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-white">
              <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <Users className="h-4 w-4 text-purple-400" />
              </div>
              Our Expert Team
            </h2>
          </div>
          <div className="p-4 md:p-6">
            <p className="text-sm text-gray-300 leading-relaxed">
              Our platform is powered by a professional and highly experienced team of blockchain specialists, 
              technology experts, and financial strategists. With decades of combined expertise in internet 
              development, blockchain innovation, and global operations, we are united by a single vision: to 
              deliver a safe, efficient, and transparent environment where traders can thrive.
            </p>
          </div>
        </div>

        {/* Trading Platform */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-[#1e1e1e]">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-white">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-400" />
              </div>
              Advanced Trading Platform
            </h2>
          </div>
          <div className="p-4 md:p-6 space-y-3">
            <p className="text-sm text-gray-300 leading-relaxed">
              We provide contract trading built on internationally recognized cryptocurrency indexes, including
              <strong className="text-white"> PANDA, BTC, ETH, BCH, LTC, ETC, EOS</strong>, and other mainstream digital assets. With 
              <strong className="text-white"> 24/7 uninterrupted access</strong>, ultra-low margin requirements, and convenient two-way 
              contract options, we make trading simpler, faster, and more flexible.
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="h-3.5 w-3.5" />
              <span>24/7 Trading Available</span>
            </div>
          </div>
        </div>

        {/* Fair Trading Mechanism */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-[#1e1e1e]">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-white">
              <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <Eye className="h-4 w-4 text-cyan-400" />
              </div>
              Transparent & Fair Trading
            </h2>
          </div>
          <div className="p-4 md:p-6">
            <p className="text-sm text-gray-300 leading-relaxed">
              By eliminating internal market indexes and adopting a fair OTC mechanism, we ensure that every 
              transaction reflects true global market data. This approach creates a marketplace that is open, 
              fair, and transparent empowering traders to make informed decisions with confidence.
            </p>
          </div>
        </div>

        {/* Mission Statement */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-[#1e1e1e]">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-white">
              <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <Target className="h-4 w-4 text-amber-400" />
              </div>
              Our Mission
            </h2>
          </div>
          <div className="p-4 md:p-6">
            <p className="text-sm text-gray-300 leading-relaxed">
              Our mission is to redefine digital asset trading by providing a secure, transparent, and globally 
              accessible platform for cryptocurrency contract trading. Through cutting-edge technology, low-cost 
              structures, and professional expertise, we are committed to ensuring fair markets, continuous access, 
              and seamless trading experiences for users worldwide.
            </p>
          </div>
        </div>

        {/* Vision Statement */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="p-4 md:p-6 border-b border-[#1e1e1e]">
            <h2 className="flex items-center gap-2.5 text-base font-semibold text-white">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Lightbulb className="h-4 w-4 text-emerald-400" />
              </div>
              Our Vision
            </h2>
          </div>
          <div className="p-4 md:p-6">
            <p className="text-sm text-gray-300 leading-relaxed">
              We envision becoming the world's most trusted and innovative cryptocurrency contract trading 
              platform where technology, transparency, and opportunity converge to create a borderless financial 
              ecosystem for every trader.
            </p>
          </div>
        </div>

        {/* Key Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 text-center">
            <div className="w-14 h-14 bg-blue-500/10 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <Globe className="h-7 w-7 text-blue-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Global Reach</h3>
            <p className="text-sm text-gray-500">
              Serving traders worldwide with operational centers across multiple continents
            </p>
          </div>

          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 text-center">
            <div className="w-14 h-14 bg-green-500/10 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <Shield className="h-7 w-7 text-green-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Secure Platform</h3>
            <p className="text-sm text-gray-500">
              Advanced security measures and professional expertise ensure safe trading
            </p>
          </div>

          <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 text-center">
            <div className="w-14 h-14 bg-amber-500/10 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <Zap className="h-7 w-7 text-amber-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">24/7 Access</h3>
            <p className="text-sm text-gray-500">
              Uninterrupted trading with ultra-low margins and flexible contract options
            </p>
          </div>
        </div>

        {/* Call to Action */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl text-center p-8">
          <h2 className="text-xl font-bold text-white mb-3">Ready to Start Trading?</h2>
          <p className="text-gray-500 mb-6">
            Join thousands of traders worldwide and experience the future of cryptocurrency trading
          </p>
          <Button 
            size="lg" 
            className="h-12 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/30 px-8 transition-all duration-150 hover:translate-y-[1px]"
            onClick={handleStartTrading}
          >
            GET STARTED NOW
          </Button>
        </div>
      </div>
    </div>
  );
}
