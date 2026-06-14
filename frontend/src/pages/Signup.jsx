import { useForm } from 'react-hook-form';

function Signup() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = (data) => {
    console.log(data);
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4 justify-center items-center min-h-screen -mt-20">
        
        <div className="card bg-base-200 w-96 shadow-xl items-center">
            <div className='card-body justify-center'>
                <h2 className='card-title justify-center'>Sign Up</h2>


        <input {...register('firstName')} placeholder="First Name" className="input input-bordered w-80 "></input>
        <input {...register('email')} placeholder="Email" className="input input-bordered w-80"></input>
        <input {...register('password')} placeholder="Password" className="input input-bordered w-80"></input>

        <button type='submit' className='btn btn-primary rounded-2xl' >Sign Up!</button>

            </div>
        </div>

      </form>
    </>
  );
}

export default Signup;
