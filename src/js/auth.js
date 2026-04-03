/* Palm Legacy – Authentication */

function resetAuthForm(){
  // Clear all input fields
  ["loginId","loginPwd","su_fname","su_lname","su_mobile","su_email","su_pwd"].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value="";
  });
  // Clear OTP boxes
  ["otp1","otp2","otp3","otp4","otp5","otp6"].forEach(boxId=>{
    const el=document.getElementById(boxId);
    if(el) el.value="";
  });
  // Reset to step 1, login tab
  goAuthStep(1);
  switchAuthTab("login");
  // Hide error messages and hints
  const err=document.getElementById("loginErr");
  if(err) err.style.display="none";
  const hint=document.getElementById("demoHint");
  if(hint) hint.style.display="none";
}

function goToAuth(afterCheckout){
  pendingCheckout=afterCheckout===true;
  resetAuthForm();
  showScreen("authScreen");
}
function goToAdmin(){
  initAdminScreen();
  showScreen("adminScreen");
}

// ═══════════════════════════════════════════════════
// MOBILE NAV (SHOP)
// ═══════════════════════════════════════════════════
function openMobileNav(){document.getElementById("mobileNav").classList.add("open");}
function closeMobileNav(){document.getElementById("mobileNav").classList.remove("open");}

// ═══════════════════════════════════════════════════
// MOBILE SIDEBAR (ADMIN)
// ═══════════════════════════════════════════════════
function openSidebar(){document.getElementById("sidebar").classList.add("sb-open");document.getElementById("sbOverlay").classList.add("open");}
function closeSidebar(){document.getElementById("sidebar").classList.remove("sb-open");document.getElementById("sbOverlay").classList.remove("open");}

// ═══════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════
function switchAuthTab(tab){
  document.getElementById("tabLogin").classList.toggle("active",tab==="login");
  document.getElementById("tabSignup").classList.toggle("active",tab==="signup");
  document.getElementById("loginForm").style.display=tab==="login"?"block":"none";
  document.getElementById("signupForm").style.display=tab==="signup"?"block":"none";
  document.getElementById("loginErr").style.display="none";
}
function goAuthStep(n){
  [1,2,3].forEach(i=>document.getElementById("authStep"+i).classList.toggle("active",i===n));
}

// Demo hint for known accounts
const DEMO_HINTS={
  "admin@palmlegacy.com":"admin123",
  "manager@palmlegacy.com":"manager123",
  "viewer@palmlegacy.com":"viewer123"
};
function checkDemoHint(){
  const id=document.getElementById("loginId").value.trim().toLowerCase();
  const hint=document.getElementById("demoHint");
  const pwdEl=document.getElementById("loginPwd");
  if(DEMO_HINTS[id]){
    hint.textContent="💡 Demo password: "+DEMO_HINTS[id];
    hint.style.display="block";
    hint.style.cssText="display:block;font-size:10px;color:var(--brown-mid);margin-top:5px;font-weight:700;cursor:pointer;";
    hint.onclick=()=>{pwdEl.value=DEMO_HINTS[id];pwdEl.type="text";setTimeout(()=>pwdEl.type="password",1500);};
  } else {
    hint.style.display="none";
  }
}

function handleLogin(){
  const id=document.getElementById("loginId").value.trim();
  const pwd=document.getElementById("loginPwd").value;
  const errEl=document.getElementById("loginErr");
  errEl.style.display="none";
  if(!id||!pwd){errEl.textContent="⚠️ Please fill all fields.";errEl.style.display="block";return;}
  const btn=document.querySelector(".btn-auth");
  if(btn){btn.textContent="⏳ Signing in…";btn.disabled=true;}
  apiLogin(id, pwd)
    .then(user=>loginSuccess(user))
    .catch(err=>{
      errEl.textContent="⚠️ "+err.message;
      errEl.style.display="block";
    })
    .finally(()=>{ if(btn){btn.textContent="Sign In →";btn.disabled=false;} });
}

function handleSignup(){
  const fname=document.getElementById("su_fname").value.trim();
  const mobile=document.getElementById("su_mobile").value.trim().replace(/\D/g,"");
  const email=document.getElementById("su_email").value.trim().toLowerCase();
  const pwd=document.getElementById("su_pwd").value;
  if(!fname){showToast("⚠️ Enter your first name");return;}
  if(mobile.length<10){showToast("⚠️ Enter a valid 10-digit mobile");return;}
  if(!email.includes("@")){showToast("⚠️ Enter a valid email");return;}
  if(pwd.length<8){showToast("⚠️ Password must be 8+ characters");return;}
  const lname=document.getElementById("su_lname").value.trim();
  apiSignup(fname, lname, email, mobile, pwd)
    .then(user=>{
      otpFlowData={id:mobile, name:fname, user};
      document.getElementById("otpTarget").textContent="+91 "+mobile;
      return apiSendOTP(mobile);
    })
    .then(res=>{
      goAuthStep(2);
      showToast("📱 OTP: "+res.otp_demo+" — check your terminal");
      ["otp1","otp2","otp3","otp4","otp5","otp6"].forEach(boxId=>{ const el=document.getElementById(boxId); if(el) el.value=""; });
      setTimeout(()=>{ const f=document.getElementById("otp1"); if(f) f.focus(); },150);
    })
    .catch(err=>showToast("⚠️ "+err.message));
}

function startOTPFlow(){
  const id=document.getElementById("loginId").value.trim();
  if(!id){showToast("⚠️ Enter your mobile number first");return;}
  otpFlowData={id:id.replace(/\D/g,""),name:null};
  document.getElementById("otpTarget").textContent="+91 "+id;
  apiSendOTP(id.replace(/\D/g,""))
    .then(res=>{
      goAuthStep(2);
      showToast("📱 OTP: "+res.otp_demo+" — check your terminal");
      ["otp1","otp2","otp3","otp4","otp5","otp6"].forEach(boxId=>{ const el=document.getElementById(boxId); if(el) el.value=""; });
      setTimeout(()=>{ const f=document.getElementById("otp1"); if(f) f.focus(); },150);
    })
    .catch(err=>showToast("⚠️ "+err.message));
}

function otpNext(el, nextId){
  // Only allow digits
  el.value = el.value.replace(/\D/g,'');
  if(el.value.length === 1 && nextId){
    const next = document.getElementById(nextId);
    if(next) next.focus();
  }
}
function otpLast(el){
  // Last box — sanitize and check if all filled
  el.value = el.value.replace(/\D/g,'');
  if(el.value.length === 1){
    // Small delay to ensure value is committed, then check
    setTimeout(()=>{
      const code = ["otp1","otp2","otp3","otp4","otp5","otp6"].map(i=>document.getElementById(i).value).join("");
      if(code.length === 6) verifyOTP();
    }, 150);
  }
}
function otpBack(event, prevId, curId){
  if(event.key === "Backspace"){
    const cur = document.getElementById(curId);
    if(cur && !cur.value && prevId){
      const prev = document.getElementById(prevId);
      if(prev){ prev.value=""; prev.focus(); }
    }
  }
}
function otpDone(){ /* deprecated — kept for safety */ }
function verifyOTP(){
  const code = ["otp1","otp2","otp3","otp4","otp5","otp6"].map(i=>document.getElementById(i).value.trim()).join("");
  if(code.length < 6){ showToast("⚠️ Enter the complete 6-digit OTP"); return; }
  if(!/^\d{6}$/.test(code)){ showToast("⚠️ OTP must be 6 digits"); return; }
  apiVerifyOTP(otpFlowData.id, code)
    .then(user=>loginSuccess(user))
    .catch(err=>showToast("⚠️ "+err.message));
}
function resendOTP(){
  ["otp1","otp2","otp3","otp4","otp5","otp6"].forEach(i=>{ const el=document.getElementById(i); if(el) el.value=""; });
  const first = document.getElementById("otp1");
  if(first) first.focus();
  showToast("📱 OTP resent!");
}

function loginSuccess(user){
  currentUser=user;
  if(typeof startIdleTracking==='function') startIdleTracking();
  goAuthStep(3);
  document.getElementById("welcomeName").textContent="Welcome, "+user.name.split(" ")[0]+"!";
  updateNavAuth();
  // Pre-fill checkout
  const parts=user.name.split(" ");
  ["fname","lname"].forEach((f,i)=>{const el=document.getElementById(f);if(el)el.value=parts[i]||"";});
  if(user.mobile){const el=document.getElementById("mobile");if(el)el.value=user.mobile;}
  if(user.email){const el=document.getElementById("pemail");if(el)el.value=user.email;}
  setTimeout(()=>{
    if(pendingCheckout){pendingCheckout=false;showScreen("shopScreen");doOpenPayment();}
    else{showScreen("shopScreen");}
  },1900);
}

function updateNavAuth(){
  const area=document.getElementById("navAuthArea");
  const adminBtn=document.getElementById("navAdminBtn");
  if(currentUser){
    const ini=currentUser.name.split(" ").map(w=>w[0]).join("").substring(0,2).toUpperCase();
    area.innerHTML=`<div class="nav-user-btn" onclick="goToAdmin()"><div class="nav-user-avatar">${ini}</div>${currentUser.name.split(" ")[0]}</div>`;
    // Show admin button only for admin/manager/viewer
    adminBtn.style.display=["admin","manager","viewer"].includes(currentUser.role)?"block":"none";
  } else {
    area.innerHTML=`<button class="nav-user-btn" onclick="goToAuth()">👤 Sign In</button>`;
    adminBtn.style.display="none";
  }
}

function logoutUser(isIdle=false){
  currentUser=null;
  setToken(null);
  if(typeof stopIdleTracking==='function') stopIdleTracking();
  updateNavAuth();
  resetAuthForm();
  showScreen("shopScreen");
  showToast(isIdle?"🔒 Signed out due to inactivity.":"👋 Signed out successfully");
}




// ═══════════════════════════════════════════════════
// API LAYER — connects frontend to Node/MySQL backend
// Set USE_API=true when server.js is running
// Always uses MySQL DB via server.js
// ═══════════════════════════════════════════════════