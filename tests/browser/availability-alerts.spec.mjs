import { test, expect } from "@playwright/test";

let count=0;
const unique = label => `${label}-${Date.now()}-${++count}@example.invalid`;
async function post(context,path,body) {
  const response=await context.request.post(path,{headers:{Origin:"http://127.0.0.1:4178"},data:body});
  const data=await response.json();expect(response.ok(),JSON.stringify(data)).toBe(true);return data;
}
async function account(context,email,name) {
  await post(context,"/api/auth/email-otp/send-verification-otp",{email});
  await post(context,"/api/auth/sign-in/email-otp",{email,otp:"123456"});
  await post(context,"/api/account?action=profile",{name});
}
const rideApi = (role,action) => `/api/member-rides?role=${role}&action=${action}`;
async function driver(context,reviewer) {
  await account(context,unique("alerts-driver"),"Шофьор Известия");
  const {application}=await post(context,"/api/account?action=apply",{legalName:"Шофьор Тест",phone:"+359888000000",vehicleModel:"Тестова кола",vehiclePlate:"PK TEST",certificateNumber:"TEST",permitNumber:"TEST",permitValidUntil:"2027-12-31",licensed:true});
  await post(reviewer,"/api/account?action=review",{accountId:application.accountId,revision:application.revision,status:"approved",documentsChecked:true,note:"Проверени тестови документи"});
}
async function create(context) {
  const body={pickup:{label:"Център, Перник",lat:42.6052,lng:23.0379},destination:{label:"Изток, Перник",lat:42.6048,lng:23.0422},passengers:1,idempotencyKey:crypto.randomUUID()};
  const {quote}=await post(context,rideApi("customer","quote"),body);
  return (await post(context,rideApi("customer","create"),{...body,quoteToken:quote.token})).ride;
}
async function mockPush(context) {
  await context.addInitScript(()=>{
    const key=new Uint8Array(65).fill(1);key[0]=4;
    const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    const sub={endpoint:`https://fcm.googleapis.com/fcm/send/browser-${crypto.randomUUID()}`,keys:{p256dh:encode(key),auth:encode(new Uint8Array(16).fill(1))}};
    const value={...sub,toJSON:()=>sub};
    const registration={pushManager:{getSubscription:async()=>value,subscribe:async()=>value}};
    Object.defineProperty(navigator.serviceWorker,"getRegistration",{value:async()=>registration});
    Object.defineProperty(navigator.serviceWorker,"ready",{value:Promise.resolve(registration)});
    window.PushManager ||= function(){};
    Object.defineProperty(window,"Notification",{value:class {static permission="granted";static requestPermission(){return Promise.resolve("granted");}}});
    Object.defineProperty(navigator,"standalone",{value:true});
    window.__audioStarts=0;
    class Audio {state="running";currentTime=0;destination={};resume(){return Promise.resolve();}close(){return Promise.resolve();}createGain(){return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}createOscillator(){return {frequency:{value:0},connect(){},start(){window.__audioStarts++;},stop(){}};}}
    window.AudioContext=Audio;
  });
}

test("member availability, notification consent, sound and full course survive offline for new work",async({browser})=>{
  const customer=await browser.newContext(),drv=await browser.newContext({viewport:{width:320,height:568}}),owner=await browser.newContext();
  try {
    await account(customer,unique("alerts-customer"),"Пътник Известия");
    await account(owner,"alerts-reviewer@example.invalid","Екип Известия");
    await driver(drv,owner);await mockPush(drv);await mockPush(customer);
    const page=await drv.newPage(),passenger=await customer.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/account/drive");
    await expect(page.getByRole("switch",{name:"Приемай нови заявки"})).toHaveAttribute("aria-checked","false");
    const ride=await create(customer);
    await expect(page.getByRole("button",{name:/Прегледай заявката/})).toHaveCount(0);
    await page.locator(".rideAlerts summary").click();
    await page.getByRole("button",{name:"ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}).click();
    await expect(page.getByText("Включени на това устройство",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"ВКЛЮЧИ ЗВУК",exact:true}).click();
    expect(await page.evaluate(()=>window.__audioStarts)).toBe(2);
    await page.getByRole("switch",{name:"Приемай нови заявки"}).click();
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked","true");
    await expect(page.getByRole("button",{name:/Прегледай заявката/})).toHaveCount(1);
    await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(4);
    await drv.setOffline(true);
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked","false");
    await expect(page.getByRole("button",{name:/Прегледай заявката/})).toHaveCount(0);
    await drv.setOffline(false);
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked","true");
    await expect.poll(()=>page.evaluate(()=>window.__audioStarts)).toBe(4);
    await page.getByRole("switch").click();
    await expect(page.getByRole("button",{name:/Прегледай заявката/})).toHaveCount(0);
    await page.getByRole("switch").click();
    await page.getByRole("button",{name:/Прегледай заявката/}).click();
    await page.getByRole("button",{name:"ПРИЕМИ ЗАЯВКАТА",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Към клиента",exact:true})).toBeVisible();
    await page.getByRole("switch").click();
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked","false");
    await passenger.goto(`/account/ride?ride=${ride.id}`);
    await expect(passenger.getByRole("heading",{name:"Шофьорът прие",exact:true})).toBeVisible();
    await passenger.locator(".rideAlerts summary").click();await passenger.getByRole("button",{name:"ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}).click();
    await page.getByRole("button",{name:"ПРИСТИГНАХ ПРИ КЛИЕНТА",exact:true}).click();
    await expect(passenger.getByRole("heading",{name:"Шофьорът пристигна",exact:true})).toBeVisible();
    await expect(passenger.locator(".pill")).toContainText("ПРИСТИГНАЛ");
    await page.getByRole("button",{name:"СТАРТИРАЙ КУРСА",exact:true}).click();
    await page.getByRole("button",{name:"ЗАВЪРШИ КУРСА",exact:true}).click();await page.getByRole("button",{name:"Завърши курса",exact:true}).click();
    await expect(passenger.getByRole("heading",{name:"Курсът е завършен",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"КЪМ ЗАЯВКИТЕ",exact:true}).click();
    const footer=await page.getByRole("button",{name:"ВКЛЮЧИ СЕ ОНЛАЙН",exact:true}).boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(568);
    const card=await page.getByRole("region",{name:"Работен режим"}).boundingBox();expect(card.width).toBeGreaterThan(260);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
    await page.screenshot({path:"/workspace/artifacts/rivo-availability-alerts/driver-offline-320.png"});
    await passenger.getByRole("button",{name:"НОВА ЗАЯВКА",exact:true}).click();
    await page.getByRole("switch").click();await page.getByRole("button",{name:"Изход",exact:true}).click();
    await expect(page.getByLabel("Имейл",{exact:true})).toBeVisible();
    // Passenger's consent stays independent from the driver's browser/session.
    expect((await customer.request.get(rideApi("customer","state"))).ok()).toBe(true);
  } finally {await Promise.all([customer.close(),drv.close(),owner.close()]);}
});

test("iPhone browser explains install without requesting notification permission",async({page})=>{
  await account(page.context(),unique("alerts-install"),"Пътник Инсталиране");
  await page.addInitScript(()=>{Object.defineProperty(navigator,"standalone",{value:false});});
  await page.goto("/account/ride");await page.locator(".rideAlerts summary").click();
  await expect(page.getByText(/Добави на начален екран/)).toBeVisible();
  await expect(page.getByRole("button",{name:"ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"})).toHaveCount(0);
  const manifest=await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.start_url).toBe("/account");
});

test("notification denial and network failure never claim saved consent; failed opt-out stays visible",async({page,context})=>{
  await account(context,unique("alerts-errors"),"Пътник Проверки");await mockPush(context);
  await page.goto("/account/ride");await page.locator(".rideAlerts summary").click();
  await expect(page.getByRole("button",{name:"ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"})).toBeEnabled();
  await page.evaluate(()=>{Notification.permission="denied";Notification.requestPermission=async()=>"denied";});
  await page.getByRole("button",{name:"ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}).click();
  await expect(page.getByRole("alert")).toContainText("не са разрешени");
  await expect(page.getByText("Включени на това устройство",{exact:true})).toHaveCount(0);
  await page.evaluate(()=>{Notification.permission="granted";Notification.requestPermission=async()=>"granted";});
  const fail=async route=>new URL(route.request().url()).searchParams.get("action")==="notification-subscription"
    ? route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Тестово прекъсване на връзката"})}) : route.continue();
  await page.route("**/api/member-rides?**",fail);
  await page.getByRole("button",{name:"ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}).click();
  await expect(page.getByRole("alert")).toContainText("Тестово прекъсване");
  await expect(page.getByText("Включени на това устройство",{exact:true})).toHaveCount(0);
  await page.unroute("**/api/member-rides?**",fail);
  await page.getByRole("button",{name:"ВКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}).click();
  await expect(page.getByText("Включени на това устройство",{exact:true})).toBeVisible();
  await page.route("**/api/member-rides?**",fail);
  await page.getByRole("button",{name:"ИЗКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}).click();
  await expect(page.getByRole("alert")).toContainText("Тестово прекъсване");
  await expect(page.getByText("Включени на това устройство",{exact:true})).toBeVisible();
  await page.unroute("**/api/member-rides?**",fail);
  await page.getByRole("button",{name:"ИЗКЛЮЧИ ИЗВЕСТИЯТА ЗА КУРС"}).click();
  await expect(page.getByText("Включени на това устройство",{exact:true})).toHaveCount(0);
});
