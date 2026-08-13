export const conversations = [
  {
    id: 1, customer: 'Rahul Sharma', channel: 'WhatsApp', status: 'AI Handled', lastMessage: 'Please share a measured granite quote.', unread: 0, date: '2026-08-12',
    messages: [
      { from: 'customer', text: 'I need black granite for a kitchen platform.', time: '10:15 AM' },
      { from: 'bot', text: 'Namaste Rahul ji! Please share the approximate platform area in sq.ft and your city. Our team will confirm the actual lot, shade and measured quote.', time: '10:15 AM' },
      { from: 'customer', text: 'About 55 sq.ft in Pune. Can I see the slab?', time: '10:18 AM' },
      { from: 'bot', text: 'Yes, we can arrange slab photos or a showroom visit. Please share your preferred day and time.', time: '10:18 AM' },
    ],
  },
  {
    id: 2, customer: 'Priya Patel', channel: 'Instagram', status: 'AI Handled', lastMessage: 'Do you have 600x1200 wall tiles?', unread: 1, date: '2026-08-11',
    messages: [
      { from: 'customer', text: 'Do you have 600x1200 wall tiles in matte finish?', time: '3:45 PM' },
      { from: 'bot', text: 'We can check the catalog by size, finish and shade. Please share the required area in sq.ft and delivery city.', time: '3:45 PM' },
    ],
  },
  {
    id: 3, customer: 'Amit Kumar', channel: 'Website', status: 'Needs Human', lastMessage: 'I need a vanity top with sink cutout.', unread: 2, date: '2026-08-12',
    messages: [
      { from: 'customer', text: 'I need a marble vanity top with one basin cutout.', time: '9:30 AM' },
      { from: 'bot', text: 'A fabrication specialist should confirm the site measurements, slab selection, edge profile and cutout template. I am connecting you with the team.', time: '9:30 AM' },
    ],
  },
  {
    id: 4, customer: 'Meera Joshi', channel: 'WhatsApp', status: 'AI Handled', lastMessage: 'Thanks, I will visit Saturday.', unread: 0, date: '2026-08-11',
    messages: [
      { from: 'customer', text: 'Can I visit to compare marble samples?', time: '11:00 AM' },
      { from: 'bot', text: 'Of course. We can show marble, granite, quartz and tile samples. Please share a convenient Saturday time for the showroom visit.', time: '11:00 AM' },
    ],
  },
  {
    id: 5, customer: 'Unknown Customer', channel: 'Website', status: 'AI Handled', lastMessage: 'How do you price fabrication?', unread: 0, date: '2026-08-12',
    messages: [
      { from: 'customer', text: 'How is kitchen platform fabrication priced?', time: '2:00 PM' },
      { from: 'bot', text: 'Pricing depends on measured area, slab material, thickness, edge profile, cutouts, polishing, transport and installation. The team will quote after measurement and slab approval.', time: '2:00 PM' },
    ],
  },
]

export const channelFilters = ['All', 'WhatsApp', 'Instagram', 'Website']
