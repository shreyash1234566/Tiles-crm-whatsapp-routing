from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table,
    TableStyle
)
from xml.sax.saxutils import escape

OUTPUT = 'output/pdf/Autozentic-Avenza-Ceramic-WhatsApp-Social-Chatbot-Proposal-FINAL-v4.pdf'
PAGE_W, PAGE_H = A4
NAVY = colors.HexColor('#10283A')
TEAL = colors.HexColor('#0E7490')
TEAL_LIGHT = colors.HexColor('#E6F5F7')
GOLD = colors.HexColor('#D49A3A')
INK = colors.HexColor('#1D2A35')
MUTED = colors.HexColor('#5B6B78')
LINE = colors.HexColor('#D9E2E8')
PALE = colors.HexColor('#F6F9FA')
WHITE = colors.white
GREEN = colors.HexColor('#16794D')

pdfmetrics.registerFont(TTFont('Segoe', r'C:\Windows\Fonts\segoeui.ttf'))
pdfmetrics.registerFont(TTFont('Segoe-Bold', r'C:\Windows\Fonts\segoeuib.ttf'))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CoverBrand', fontName='Segoe-Bold', fontSize=15, leading=18, textColor=WHITE, tracking=1.2, spaceAfter=7))
styles.add(ParagraphStyle(name='CoverTitle', fontName='Segoe-Bold', fontSize=29, leading=34, textColor=WHITE, spaceAfter=14))
styles.add(ParagraphStyle(name='CoverSub', fontName='Segoe', fontSize=12, leading=18, textColor=colors.HexColor('#D7E6EC'), spaceAfter=4))
styles.add(ParagraphStyle(name='H1x', fontName='Segoe-Bold', fontSize=20, leading=25, textColor=NAVY, spaceBefore=2, spaceAfter=8))
styles.add(ParagraphStyle(name='H2x', fontName='Segoe-Bold', fontSize=13.5, leading=18, textColor=TEAL, spaceBefore=10, spaceAfter=5))
styles.add(ParagraphStyle(name='Bodyx', fontName='Segoe', fontSize=9.2, leading=14, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name='Smallx', fontName='Segoe', fontSize=7.8, leading=11, textColor=MUTED, spaceAfter=3))
styles.add(ParagraphStyle(name='Bulletx', fontName='Segoe', fontSize=9, leading=13, textColor=INK, leftIndent=13, firstLineIndent=-7, bulletIndent=1, spaceAfter=3))
styles.add(ParagraphStyle(name='TableHeadx', fontName='Segoe-Bold', fontSize=8.5, leading=11, textColor=WHITE))
styles.add(ParagraphStyle(name='TableCellx', fontName='Segoe', fontSize=8.3, leading=11, textColor=INK))
styles.add(ParagraphStyle(name='CenterSmallx', fontName='Segoe', fontSize=8.3, leading=12, textColor=MUTED, alignment=TA_CENTER))

def para(text, style='Bodyx'):
    return Paragraph(escape(text), styles[style])

def rich(text, style='Bodyx'):
    return Paragraph(text, styles[style])

def bullets(items):
    return [Paragraph(escape(item), styles['Bulletx'], bulletText='•') for item in items]

def section(title, intro=None):
    flow = [Paragraph(escape(title), styles['H1x'])]
    if intro:
        flow.append(para(intro))
    return flow

def make_table(data, widths, header=True, row_backgrounds=None):
    converted = []
    for row_index, row in enumerate(data):
        converted_row = []
        for cell in row:
            if isinstance(cell, Paragraph):
                converted_row.append(cell)
            elif row_index == 0 and header:
                converted_row.append(Paragraph(escape(str(cell)), styles['TableHeadx']))
            else:
                converted_row.append(Paragraph(escape(str(cell)), styles['TableCellx']))
        converted.append(converted_row)
    commands = [
        ('BACKGROUND', (0, 0), (-1, 0), NAVY if header else PALE),
        ('GRID', (0, 0), (-1, -1), 0.35, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]
    if row_backgrounds:
        for row_index, background in row_backgrounds.items():
            commands.append(('BACKGROUND', (0, row_index), (-1, row_index), background))
    else:
        for row_index in range(1 if header else 0, len(converted)):
            if row_index % 2 == 0:
                commands.append(('BACKGROUND', (0, row_index), (-1, row_index), PALE))
    result = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign='LEFT')
    result.setStyle(TableStyle(commands))
    return result

def card(title, body, color=TEAL_LIGHT):
    result = Table([[ [Paragraph(escape(title), styles['H2x']), para(body)] ]], colWidths=[174 * mm])
    result.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), color),
        ('BOX', (0, 0), (-1, -1), 0.6, LINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 11),
        ('RIGHTPADDING', (0, 0), (-1, -1), 11),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return result

def on_page(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setStrokeColor(TEAL)
        canvas.setLineWidth(1.2)
        canvas.line(18 * mm, PAGE_H - 14 * mm, 26 * mm, PAGE_H - 14 * mm)
        canvas.setFont('Segoe-Bold', 8)
        canvas.setFillColor(NAVY)
        canvas.drawString(29 * mm, PAGE_H - 16 * mm, 'AUTOZENTIC')
        canvas.setFont('Segoe', 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 16 * mm, 'Avenza Ceramic | Digital Engagement Proposal')
        canvas.setStrokeColor(LINE)
        canvas.line(18 * mm, 16 * mm, PAGE_W - 18 * mm, 16 * mm)
        canvas.setFont('Segoe', 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, 'Confidential proposal | Prepared for Nilesh Singhal')
        canvas.drawRightString(PAGE_W - 18 * mm, 10 * mm, f'{doc.page}')
    canvas.restoreState()

doc = BaseDocTemplate(
    OUTPUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
    topMargin=24 * mm, bottomMargin=23 * mm,
    title='WhatsApp Marketing and Social Chatbot Proposal', author='Autozentic',
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='normal')
doc.addPageTemplates([PageTemplate(id='main', frames=frame, onPage=on_page)])
story = []

cover = Table([
    [Paragraph('AUTOZENTIC', styles['CoverBrand'])],
    [Paragraph('WhatsApp Marketing<br/>and Social Chatbot', styles['CoverTitle'])],
    [Paragraph('A complete digital engagement solution for Avenza Ceramic', styles['CoverSub'])],
    [Spacer(1, 26 * mm)],
    [Table([
        [Paragraph('Prepared for', styles['Smallx']), Paragraph('Nilesh Singhal', styles['CoverSub'])],
        [Paragraph('Business', styles['Smallx']), Paragraph('Avenza Ceramic', styles['CoverSub'])],
        [Paragraph('Prepared by', styles['Smallx']), Paragraph('Autozentic', styles['CoverSub'])],
        [Paragraph('Date', styles['Smallx']), Paragraph('24 August 2026', styles['CoverSub'])],
    ], colWidths=[30 * mm, 110 * mm], style=TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))],
], colWidths=[174 * mm])
cover.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), NAVY),
    ('LEFTPADDING', (0, 0), (-1, -1), 18),
    ('RIGHTPADDING', (0, 0), (-1, -1), 18),
    ('TOPPADDING', (0, 0), (-1, -1), 18),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 18),
]))
story.extend([Spacer(1, 21 * mm), cover, Spacer(1, 15 * mm)])
story.append(rich('<b>Professional fee:</b> As per commercial terms + applicable taxes', 'H2x'))
story.append(para('Includes WhatsApp marketing software, Instagram and Facebook chatbot service, one year server support, two years bug support, and one month of Instagram and Facebook ad campaign management.'))
story.append(PageBreak())

story.extend(section('1. Proposal Summary', 'Autozentic will help Avenza Ceramic manage customer conversations, promote products, capture enquiries and run measurable digital campaigns across WhatsApp, Instagram and Facebook.'))
story.append(para("The solution is designed for a ceramic, tile, marble and surface business where customers often ask about product availability, size, price, delivery, showroom visits and project requirements."))
story.append(Spacer(1, 3 * mm))
story.append(make_table([
    ['Business objective', 'How the solution helps Avenza Ceramic'],
    ['Generate more enquiries', 'Use Instagram and Facebook campaigns with WhatsApp call-to-action and lead capture.'],
    ['Respond faster', 'Use automated replies for product, showroom, delivery and price-related questions.'],
    ['Promote collections', 'Broadcast approved WhatsApp campaigns for new products, offers and seasonal promotions.'],
    ['Improve follow-up', 'Store conversations, tags, customer notes and lead information in one place.'],
    ['Measure performance', 'Track delivery, read, reply, lead and ad-campaign performance.'],
], [49 * mm, 125 * mm]))
story.append(Spacer(1, 7 * mm))
story.append(card('Implementation principle', "The system will be configured around Avenza Ceramic's actual products, customer questions, showroom information and sales process. Final automation content will be prepared after receiving business details and approved content from the client."))
story.append(Spacer(1, 7 * mm))
story.append(Paragraph('Included channels', styles['H2x']))
story.extend(bullets([
    'WhatsApp Business marketing and customer communication',
    'Instagram direct-message chatbot and enquiry automation',
    'Facebook Messenger chatbot and enquiry automation',
    'Instagram and Facebook advertising campaign management',
]))
story.append(PageBreak())

story.extend(section('2. WhatsApp Marketing Services', 'The WhatsApp marketing system will help Avenza Ceramic communicate with customers and prospects through structured, permission-based campaigns.'))
story.extend(bullets([
    'Customer contact management with tags and categories',
    'Promotional broadcasts for tile, ceramic, marble and surface collections',
    'Product launch, offer, festival and seasonal campaigns',
    'Approved WhatsApp template management',
    'Scheduled campaigns and campaign history',
    'Delivery and read-status tracking',
    'Central inbox for customer replies',
    'Customer notes, lead status and follow-up information',
    'Manual staff takeover when a customer needs personal assistance',
    'Basic campaign performance reporting',
]))
story.append(Spacer(1, 3 * mm))
story.append(Paragraph('Example campaigns', styles['H2x']))
story.append(make_table([
    ['Campaign', 'Example message purpose'],
    ['New collection', 'Announce new marble-look, bathroom, outdoor or large-format tile collections.'],
    ['Showroom visit', 'Invite customers to visit the showroom and review actual samples.'],
    ['Trade promotion', 'Share dealer, contractor or project pricing with eligible contacts.'],
    ['Follow-up', 'Remind a customer about a quotation, sample review or site visit.'],
], [48 * mm, 126 * mm]))
story.append(Spacer(1, 7 * mm))
story.append(card('Important operating condition', 'Broadcast campaigns require customer consent and approved message templates. Avenza Ceramic will provide or approve the contact list and promotional content before campaigns are sent.'))
story.append(PageBreak())

story.extend(section('3. Official Meta WhatsApp Message Charges', 'Meta charges WhatsApp Business Platform messages on a per-delivered-message basis. The applicable rate depends on the destination market and message category.'))
story.append(rich('Meta confirms that it charges when a message is <b>delivered</b>, not merely when it is sent. Rates vary by market and category. See the <link href="https://business.whatsapp.com/products/platform-pricing" color="#0E7490">official Meta pricing page</link>.'))
story.append(Spacer(1, 4 * mm))
story.append(make_table([
    ['Category', 'India reference rate', 'Typical use'],
    ['Marketing', 'Rs. 0.8631 per delivered message', 'Promotions, product launches, offers and broadcasts'],
    ['Utility', 'Rs. 0.1150 per delivered message', 'Order, payment and delivery updates'],
    ['Authentication', 'Rs. 0.1150 per delivered message', 'OTP and account verification'],
    ['Authentication - international', 'Rs. 2.4971 per delivered message', 'OTP sent to recipients outside the business country'],
    ['Service replies', 'Generally free within the customer-service window', 'Replies to incoming customer enquiries'],
], [34 * mm, 52 * mm, 88 * mm]))
story.append(Spacer(1, 5 * mm))
story.append(card('Rate-card disclaimer', "The above India figures are a current working reference for the July 2026 rate card. Meta may revise rates, tiers or category rules. Final charges, applicable taxes and any third-party platform fees will be billed separately and are not included in Autozentic's professional fee.", color=colors.HexColor('#FFF5E5')))
story.append(PageBreak())

story.extend(section('4. Instagram and Facebook Chatbot', 'The chatbot will help Avenza Ceramic answer common questions and capture useful information before handing the conversation to the sales team.'))
story.extend(bullets([
    'Product and collection enquiry automation',
    'Tile size, application and availability questions',
    'Marble, granite and ceramic enquiry flow',
    'Price and catalogue request capture',
    'Showroom location and timing information',
    'Delivery-area and service-area information',
    'Dealer, contractor and project enquiry handling',
    'Site-visit request and lead capture',
    'Customer name, phone and approximate area capture',
    'Requirement type capture: bathroom, kitchen, flooring, elevation or project',
    'Automatic handoff to a staff member',
    'Conversation history and lead tracking',
]))
story.append(Spacer(1, 4 * mm))
story.append(Paragraph('Initial chatbot knowledge setup', styles['H2x']))
story.append(make_table([
    ['Knowledge area', 'Information required from Avenza Ceramic'],
    ['Business', 'Address, timings, phone number, service areas and showroom details'],
    ['Products', 'Main collections, sizes, finishes, availability and approved descriptions'],
    ['Commercial', 'Price enquiry process, quotation process and dealer/project process'],
    ['Sales', 'Lead handoff rules, staff contact details and follow-up process'],
    ['FAQs', 'Delivery, installation, samples, returns and common customer questions'],
], [46 * mm, 128 * mm]))
story.append(Spacer(1, 7 * mm))
story.append(card('Chatbot API', 'The chatbot will initially use a suitable free-tier API key, subject to the provider\'s availability and usage limits.'))
story.append(PageBreak())

story.extend(section('5. Instagram and Facebook Advertising Service', 'Autozentic will create and manage one month of Instagram and Facebook advertising campaigns for Avenza Ceramic.'))
story.extend(bullets([
    'Campaign objective and funnel planning',
    'Audience, location and interest targeting',
    'Lead-generation or WhatsApp-enquiry campaign setup',
    'Ad copy and campaign messaging',
    'Basic campaign and ad-set structure',
    'WhatsApp call-to-action or lead-form setup',
    'Campaign monitoring and optimisation',
    'Audience and budget adjustments based on performance',
    'Basic end-of-month performance report',
]))
story.append(Spacer(1, 5 * mm))
story.append(make_table([
    ['Item', 'Included / excluded'],
    ['Campaign management fee', 'Included for one month'],
    ['Meta advertising budget', 'Not included; paid separately by the client'],
    ['Basic ad copy', 'Included'],
    ['Professional photo/video shoot', 'Not included'],
    ['Influencer or creator fees', 'Not included'],
    ['Additional campaign months', 'Quoted separately'],
], [66 * mm, 108 * mm]))
story.append(Spacer(1, 7 * mm))
story.append(card('Advertising fee', 'One-month Instagram and Facebook ad campaign creation and management: Rs. 8,000. The advertising spend paid to Meta is separate and will be controlled by Avenza Ceramic.', color=colors.HexColor('#EAF6EE')))
story.append(PageBreak())

story.extend(section('6. Hosting, Support and Delivery'))
story.append(make_table([
    ['Support item', 'Coverage'],
    ['Server / hosting', 'One year from deployment, including basic hosting and operational configuration.'],
    ['Bug support', 'Two years for bugs in the delivered software and existing workflows.'],
    ['Implementation', 'Development and setup will be completed in under 7 working days after receiving required access and business information.'],
    ['Renewals', 'Server renewal after one year is chargeable separately.'],
], [50 * mm, 124 * mm]))
story.append(Spacer(1, 7 * mm))
story.append(Paragraph('Information required from Avenza Ceramic', styles['H2x']))
story.extend(bullets([
    'Facebook Page and Instagram professional account access',
    'WhatsApp Business account and Meta Business Manager details',
    'Product catalogue, approved descriptions and pricing information',
    'Business address, showroom timings and service areas',
    'Frequently asked questions and delivery information',
    'Approved promotional content and campaign offers',
    'Customer database with valid consent for broadcasts',
]))
story.append(Spacer(1, 5 * mm))
story.append(Paragraph('Bug support exclusions', styles['H2x']))
story.extend(bullets([
    'New features, major redesigns and new integrations',
    'Paid AI/API usage or third-party subscription fees',
    "Meta policy, API or account changes outside Autozentic's control",
    'New advertising campaigns after the included one-month period',
    'Professional photography, video production and content shoots',
]))
story.append(PageBreak())

story.extend(section('7. Commercial Terms'))
story.append(make_table([
    ['Service', 'Professional fee'],
    ['WhatsApp marketing and Instagram/Facebook chatbot software', 'Rs. 37,000'],
    ['Instagram and Facebook ad campaign management for one month', 'Rs. 8,000'],
    ['Total professional fee', 'Rs. 45,000'],
], [128 * mm, 46 * mm], row_backgrounds={3: TEAL_LIGHT}))
story.append(Spacer(1, 7 * mm))
story.append(Paragraph('Payment terms', styles['H2x']))
story.extend(bullets([
    '50% advance: Rs. 22,500',
    '50% before final launch: Rs. 22,500',
    'Applicable taxes, Meta message charges and advertising budget are additional.',
]))
story.append(Spacer(1, 4 * mm))
story.append(Paragraph('Compliance and proposal validity', styles['H2x']))
story.append(para('Broadcasts will be sent only to customers who have provided valid consent or have an appropriate business relationship with Avenza Ceramic. WhatsApp templates and chatbot content must comply with Meta policies. This proposal is valid for 2 days from the date above.'))
story.append(Spacer(1, 9 * mm))
story.append(card('Acceptance', 'We look forward to helping Avenza Ceramic build a stronger digital sales and customer-support system through WhatsApp, Instagram and Facebook.', color=colors.HexColor('#EEF3F6')))

doc.build(story)
print(OUTPUT)
