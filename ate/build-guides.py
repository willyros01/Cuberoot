from pathlib import Path
import json,re
from bs4 import BeautifulSoup
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Table,TableStyle,KeepTogether,Image
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
root=Path(__file__).resolve().parents[1]
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
pdfmetrics.registerFont(TTFont('ATE',font));pdfmetrics.registerFont(TTFont('ATEBold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFontFamily('ATE',normal='ATE',bold='ATEBold',italic='ATE',boldItalic='ATEBold')
styles=getSampleStyleSheet(); styles.add(ParagraphStyle(name='ATEBody',fontName='ATE',fontSize=18,leading=27,spaceAfter=14,textColor=colors.HexColor('#15271d')));styles.add(ParagraphStyle(name='ATETitle',fontName='ATEBold',fontSize=34,leading=42,spaceAfter=22,textColor=colors.HexColor('#17543c')));styles.add(ParagraphStyle(name='ATEH',fontName='ATEBold',fontSize=25,leading=33,spaceBefore=24,spaceAfter=15,keepWithNext=True,textColor=colors.HexColor('#17543c')));styles.add(ParagraphStyle(name='ATESmall',fontName='ATE',fontSize=16,leading=23,spaceAfter=12))
def clean(node):
 s=str(node);s=re.sub(r'</?(p|li)[^>]*>','',s);s=re.sub(r'<code[^>]*>','<b>',s).replace('</code>','</b>');s=re.sub(r'class="[^"]*"','',s);s=s.replace('→',' > ').replace('−','-').replace('–','-').replace('—','-');return s

def footer(c,d):
 c.setStrokeColor(colors.HexColor('#b4c5b8'));c.line(42,42,A4[0]-42,42);c.setFont('ATE',10);c.setFillColor(colors.HexColor('#38564a'));c.drawString(42,26,'CUBEROOT  |  ATE  |  Large-print guide');c.drawRightString(A4[0]-42,26,str(d.page))
content=json.loads((root/'ate/guide-content.json').read_text())
for mode,title,name in [('quick','Quick Start Guide','ate-quick-start.pdf'),('full','Full User Guide','ate-user-guide.pdf')]:
 story=[Image(str(root/'ate/assets/icon.png'),90,90,hAlign='LEFT'),Spacer(1,16),Paragraph('Another Text Editor (ATE)',styles['ATETitle']),Paragraph(title,styles['ATEH']),Paragraph('Updated 12 November 2026',styles['ATEBody']),Paragraph('Large print · Mobile and desktop edition',styles['ATEBody']),Paragraph('iPhone/iPad and universal Mac require a TestFlight invitation. Android APK and the unsigned Windows x64 installer are on Cuberoot. The signed, notarized universal Mac installer is also available.',styles['ATEBody']),Paragraph('Current downloads and online guides: <link href="https://www.cuberoot-systems.com/ate/">www.cuberoot-systems.com/ate/</link>',styles['ATEBody']),PageBreak()]
 story.extend([Paragraph('Your editor controls',styles['ATEH']),Image(str(root/'ate/assets/editor-map.png'),500,275),Paragraph('Mobile editor controls; desktop uses Exit and a native Save dialog.',styles['ATESmall']),Spacer(1,20)])
 for i,(heading,body) in enumerate(content[mode],1):
  story.append(Paragraph(f'{i}. {heading}',styles['ATEH']))
  soup=BeautifulSoup(body,'html.parser')
  for node in soup.find_all(['p','li','table']):
   if node.find_parent(['table']):continue
   if node.name=='table':
    rows=[]
    for tr in node.find_all('tr'):
     cells=tr.find_all(['td','th']);rows.append([Paragraph(clean(x).replace('<td>','').replace('</td>','').replace('<th>','<b>').replace('</th>','</b>'),styles['ATESmall']) for x in cells])
    cols=len(rows[0]);tab=Table(rows,colWidths=[(A4[0]-90)/cols]*cols,repeatRows=1,hAlign='LEFT');tab.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e2f3e7')),('GRID',(0,0),(-1,-1),1,colors.HexColor('#b4c5b8')),('VALIGN',(0,0),(-1,-1),'TOP'),('PADDING',(0,0),(-1,-1),10)]));story.extend([tab,Spacer(1,16)])
   elif node.name=='li':story.append(Paragraph('• '+clean(node),styles['ATEBody']))
   else:story.append(Paragraph(clean(node),styles['ATEBody']))
 doc=SimpleDocTemplate(str(root/'guides/ate'/name),pagesize=A4,rightMargin=45,leftMargin=45,topMargin=45,bottomMargin=60,title='ATE - '+title,author='Cuberoot Systems Architects')
 doc.build(story,onFirstPage=footer,onLaterPages=footer)
 print(name)

