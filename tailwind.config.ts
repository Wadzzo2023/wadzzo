import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./components/**/**/*.{ts,tsx}",
		"./components/**/**/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
		// "package" (singular) matches wadzz0's own submodule checkout path —
		// this repo's is "packages" (plural, per .gitmodules), which that glob
		// never matched. Tailwind's JIT scanner only emits CSS for class names
		// it finds in a `content` file, so every class used anywhere inside
		// the connect_wallet submodule (inputs, buttons, tabs, the whole
		// dialog) was silently never generated — anything that looked
		// passable before was coincidence: a class also happening to appear
		// verbatim in some scanned wadzzoAR file, not that file's own styling
		// actually taking effect. Both globs are kept since either path
		// convention may exist depending on how a given project's submodule
		// is checked out.
		"./package/**/*.{jsx,tsx,ts}",
	],

	theme: {
		extend: {
			fontFamily: {
				display: ['var(--font-display)', 'system-ui', 'sans-serif'],
				body: ['var(--font-body)', 'system-ui', 'sans-serif'],
			},
			colors: {
				// Arcade ground + ink. Named `ar-*` so they never collide with the
				// shadcn semantic tokens, which are re-pointed at these in arcade.css.
				ar: {
					void: 'hsl(var(--ar-void))',
					bg: 'hsl(var(--ar-bg))',
					surface: 'hsl(var(--ar-surface))',
					'surface-2': 'hsl(var(--ar-surface-2))',
					'surface-3': 'hsl(var(--ar-surface-3))',
					line: 'hsl(var(--ar-line))',
					'line-bright': 'hsl(var(--ar-line-bright))',
					text: 'hsl(var(--ar-text))',
					dim: 'hsl(var(--ar-text-dim))',
					faint: 'hsl(var(--ar-text-faint))',
					green: 'hsl(var(--ar-green))',
					'green-hot': 'hsl(var(--ar-green-hot))',
					'green-deep': 'hsl(var(--ar-green-deep))',
					'green-ink': 'hsl(var(--ar-green-ink))',
					danger: 'hsl(var(--ar-danger))',
					locked: 'hsl(var(--ar-locked))',
				},
				rarity: {
					common: 'hsl(var(--rarity-common))',
					rare: 'hsl(var(--rarity-rare))',
					epic: 'hsl(var(--rarity-epic))',
					legendary: 'hsl(var(--rarity-legendary))',
					mythic: 'hsl(var(--rarity-mythic))',
				},
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				gold: {
					DEFAULT: 'hsl(var(--gold))',
					foreground: 'hsl(var(--gold-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				chart: {
					'1': 'hsl(var(--chart-1))',
					'2': 'hsl(var(--chart-2))',
					'3': 'hsl(var(--chart-3))',
					'4': 'hsl(var(--chart-4))',
					'5': 'hsl(var(--chart-5))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				ar: 'var(--ar-r)',
				'ar-lg': 'var(--ar-r-lg)',
				'ar-xl': 'var(--ar-r-xl)',
			},
			// The phone the app pretends to be when it's shown on a desktop browser.
			// 430x932 is the iPhone 17 Pro Max logical viewport — the largest common
			// phone, so nothing designed against it overflows a smaller one.
			maxWidth: {
				device: '430px',
				tablet: '600px',
			},
			height: {
				device: '932px',
			},
			animation: {
				'gradient-x': 'gradient-x 3s ease infinite',
				'shimmer': 'shimmer 2s ease-in-out infinite',
			},
			keyframes: {
				'gradient-x': {
					'0%, 100%': {
						'background-position': '0% 50%'
					},
					'50%': {
						'background-position': '100% 50%'
					}
				},
				'shimmer': {
					'0%': {
						transform: 'translateX(-100%)'
					},
					'100%': {
						transform: 'translateX(100%)'
					}
				}
			}

		}
	},
	plugins: [require("tailwindcss-animate"),
	require('tailwind-scrollbar-hide')],
} satisfies Config;
