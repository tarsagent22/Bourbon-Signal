"""Extract only public retail-premises fields from official state license files."""
import argparse, csv, hashlib, io, json, re, zipfile
from collections import Counter
from pathlib import Path
from datetime import date, datetime

parser=argparse.ArgumentParser()
parser.add_argument('--capture-dir',required=True)
parser.add_argument('--as-of',default=date.today().isoformat())
args=parser.parse_args()
capture=Path(args.capture_dir)
as_of=date.fromisoformat(args.as_of)
def write(state,rows,url,published=None,source_file=None):
    if not rows: raise ValueError(f'No {state} retail store licenses parsed')
    digest=hashlib.sha256(source_file.read_bytes()).hexdigest() if source_file else None
    data={'state':state,'url':url,'publishedAt':published,'sha256':digest,'stores':rows}
    (capture/f'store-library-licenses-{state}.json').write_text(json.dumps(data),encoding='utf-8')
    print(json.dumps({'state':state,'count':len(rows)}))

file=capture/'store-library-ca.zip'
if file.exists():
    rows=[]
    with zipfile.ZipFile(file) as z, z.open('ABC-DailyDataExport.csv') as raw:
        stream=io.TextIOWrapper(raw,encoding='utf-8-sig',errors='strict')
        published=next(stream).strip()
        reader=csv.DictReader(stream)
        for original in reader:
            r={k.strip():str(v or '').strip() for k,v in original.items()}
            if r['License Type']!='21' or r['Type Status'].upper()!='ACTIVE' or r['Lic or App'].upper() not in ['LIC','LICENSE']: continue
            rows.append({'id':'ca-abc-'+r['File Number'],'state':'CA','name':r['DBA Name'] or r['Primary Name'],'address':', '.join(x for x in [r['Prem Addr 1'],r['Prem Addr 2']] if x),'city':r['Prem City'],'zip':r['Prem Zip'],'county':r['Prem County'],'aliases':[r['Primary Name'],r['File Number']],'source':'California ABC active Off-Sale General licenses','sourceUrl':'https://www.abc.ca.gov/licensing/licensing-reports/'})
    if len(rows)<10000: raise ValueError(f'Incomplete CA directory: {len(rows)}')
    write('CA',rows,'https://www.abc.ca.gov/wp-content/uploads/DailyExport-CSV.zip',published,file)

file=capture/'store-library-ga.xlsx'
if file.exists():
    import openpyxl
    wb=openpyxl.load_workbook(file,read_only=True,data_only=True)
    sheet=wb['Search Results']; values=iter(sheet.values); headers=next(values)
    geo=json.loads((Path(__file__).resolve().parents[1]/'src/data/us-geography-2025.generated.json').read_text(encoding='utf-8'))
    city_names={re.sub(r'\s+(city|town|village|CDP|municipality|borough)$','',x[2],flags=re.I).upper() for x in geo['places'] if x[1]=='GA'}
    for city in list(city_names):
        # Postal addresses use the city portion of consolidated city/counties.
        city_names.add(re.sub(r'[-–].*(?:COUNTY|CONSOLIDATED|UNIFIED).*$', '', city).strip())
    cities=sorted(city_names,key=len,reverse=True)
    rows=[]; excluded=[]; types=Counter()
    for fields in values:
        r=dict(zip(headers,fields)); types[str(r['License Type'])]+=1
        if r['Liquor']!=1 or str(r['License Type']).upper()!='RETAIL': continue
        full=str(r['List Format Address'] or '').strip()
        match=re.match(r'^(.*?)\s+GA\s+(\d{5}(?:-\d{4})?)$',full,re.I)
        if not match: excluded.append({'id':r['ID'],'reason':'incomplete physical address'}); continue
        prefix=match[1].strip()
        city=next((c for c in cities if re.search(r'\b'+re.escape(c)+r'$',prefix,re.I)),None)
        if not city and str(r['Local Lic Type'])=='LLTCITY':
            c=str(r['Local Lic Location'] or '').strip()
            if c and prefix.upper().endswith(' '+c.upper()): city=c
        if not city:
            # The official report embeds postal city in its full address. Split
            # after the final street designator and optional unit/direction;
            # retain the literal postal name, including unincorporated towns.
            tails=list(re.finditer(r'\b(?:ST|STREET|RD|ROAD|DR|DRIVE|AVE|AVENUE|BLVD|BOULEVARD|LN|LANE|WAY|CT|COURT|HWY|HIGHWAY|PKWY|PARKWAY|EXT)\b',prefix,re.I))
            if tails:
                candidate=prefix[tails[-1].end():].strip()
                candidate=re.sub(r'^(?:\d+[A-Z]*\s+)?(?:N|S|E|W|NE|NW|SE|SW)\s+', '', candidate)
                candidate=re.sub(r'^(?:STE|SUITE|UNIT|#)\s*\w+\s+', '', candidate)
                if re.fullmatch(r'[A-Z][A-Z .\'-]{1,45}',candidate): city=candidate
        if not city: excluded.append({'id':r['ID'],'reason':'city could not be verified'}); continue
        street=prefix[:-len(city)].strip()
        rows.append({'id':'ga-dor-'+str(r['ID']),'state':'GA','name':r['List Format Name'],'address':street,'city':city.title(),'zip':match[2],'source':'Georgia DOR spirits retailer license directory','sourceUrl':'https://dor.georgia.gov/active-alcohol-licenses'})
    print(json.dumps({'GAExcluded':len(excluded),'licenseTypes':dict(types)}))
    (capture/'store-library-ga-excluded.json').write_text(json.dumps(excluded),encoding='utf-8')
    if len(rows)<1000: raise ValueError(f'Incomplete GA directory: {len(rows)}')
    write('GA',rows,'https://dor.georgia.gov/document/document/alcohol-accounts-active-june-2026xlsx/download','2026-06',file)

file=capture/'store-library-ky-active-packages.csv'
if file.exists():
    with file.open(encoding='utf-8-sig',newline='') as f:
        lines=list(csv.reader(f))
    header=next(i for i,r in enumerate(lines) if r and r[0]=='SiteID')
    rows=[]
    for fields in lines[header+1:]:
        if not fields: continue
        r=dict(zip(lines[header],fields))
        if r.get('Status')!='Active' or r.get('LicenseType')!='Quota Retail Package License': continue
        m=re.match(r'^(.*?),\s*KY\s+(\d{5}(?:-\d{4})?)$',r['PremisesCityState'])
        city=m[1] if m else r['City'].strip()
        if not city or not r['PremisesStreet'].strip(): continue
        rows.append({'id':'ky-abc-'+r['LicenseNumber'],'state':'KY','name':r['DBA'] or r['Licensee'],'address':r['PremisesStreet'],'city':city,'zip':m[2] if m else '', 'county':r['County'],'aliases':[r['Licensee'],r['LicenseNumber']],'source':'Kentucky ABC active Quota Retail Package licenses','sourceUrl':'https://abcportal.ky.gov/BelleExternal/ReportGenerator/Reports'})
    if len(rows)<1000: raise ValueError(f'Incomplete Kentucky store licenses: {len(rows)}')
    write('KY',rows,'https://abcportal.ky.gov/BelleExternal/ReportGenerator/Reports','2026-10-08',file)

file=capture/'store-library-fl-licenses-raw.csv'
if file.exists():
    rows=[]
    with file.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.DictReader(f):
            if r['Profession']!='4006' or not re.fullmatch(r'3[A-D]?PS',r['Series']) or r['Primary Status'] not in ['20','30','31','32'] or r['Secondary Status']!='20': continue
            if r['Location State']!='FL': continue
            rows.append({'id':'fl-dbpr-'+r['License Number'],'state':'FL','name':r['DBA'] or r['Owner Name'],'address':', '.join(x for x in [r['Location Address 1'],r['Location Address 2'],r['Location Address 3']] if x),'city':r['Location City'],'zip':r['Location ZIP'][:5],'aliases':[r['Owner Name'],r['License Number']],'source':'Florida DBPR current active package-store liquor licenses','sourceUrl':'https://www2.myfloridalicense.com/alcoholic-beverages-and-tobacco/public-records/'})
    if len(rows)<2000: raise ValueError(f'Incomplete Florida package store licenses: {len(rows)}')
    write('FL',rows,'https://www2.myfloridalicense.com/sto/file_download/extracts/bd4006lic.csv','2026-10-08',file)

file=capture/'store-library-il-licenses-raw.csv'
if file.exists():
    rows=[]; excluded=0
    with file.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.DictReader(f):
            if r['license_class']!='1A - RETAILER' or r['retail_type']!='OFF-PREMISES CONSUMPTION': continue
            try: expiry=datetime.strptime(r['current_expiration_date'],'%m/%d/%Y').date()
            except ValueError: continue
            if expiry<as_of or r['acct_state']!='IL': continue
            city=r['acct_city'].strip()
            match=re.fullmatch(r'(.*?)\s+'+re.escape(city)+r'\s+IL,?\s+(\d{5})(\d{4})?',r['dba_address'].strip(),re.I)
            if not city or not match: excluded+=1; continue
            rows.append({'id':'il-ilcc-'+r['license_number'],'state':'IL','name':r['acct_name'],'address':match[1].strip(),'city':city.title(),'zip':match[2],'county':r['county'],'aliases':[r['license_number']],'source':'Illinois ILCC unexpired off-premises retailer licenses','sourceUrl':'https://ilcc.illinois.gov/content/dam/soi/en/web/ilcc/datasources/ilcc-licenses-daily-export.csv'})
    print(json.dumps({'ILExcludedIncompleteAddress':excluded,'asOf':as_of.isoformat()}))
    write('IL',rows,'https://ilcc.illinois.gov/content/dam/soi/en/web/ilcc/datasources/ilcc-licenses-daily-export.csv',as_of.isoformat(),file)
